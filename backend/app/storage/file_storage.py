import os
import zipfile
from abc import ABC, abstractmethod
from pathlib import Path

import aiofiles

from app.core.config import settings
from app.core.exceptions import StorageError


class FileStorage(ABC):
    @abstractmethod
    async def save(self, project_id: str, artifact_id: str, filename: str, content: bytes) -> str:
        pass

    @abstractmethod
    async def exists(self, storage_path: str) -> bool:
        pass

    @abstractmethod
    async def delete_directory(self, rel_dir: str) -> None:
        pass

    @abstractmethod
    async def read(self, storage_path: str) -> bytes:
        pass

    @abstractmethod
    async def delete(self, storage_path: str) -> None:
        pass

    @abstractmethod
    async def delete_project_directory(self, project_id: str) -> None:
        pass

    @abstractmethod
    async def extract_zip(self, storage_path: str, dest_dir: str) -> str:
        pass


class LocalFileStorage(FileStorage):
    def __init__(self, base_path: str | None = None):
        self.base_path = Path(base_path or settings.storage_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, storage_path: str) -> Path:
        resolved = (self.base_path / storage_path).resolve()
        if not str(resolved).startswith(str(self.base_path.resolve())):
            raise StorageError("Path traversal detected")
        return resolved

    async def save(self, project_id: str, artifact_id: str, filename: str, content: bytes) -> str:
        safe_name = Path(filename).name
        rel_path = f"{project_id}/uploads/{artifact_id}/{safe_name}"
        full_path = self._resolve_path(rel_path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(full_path, "wb") as f:
            await f.write(content)
        return rel_path

    def exists(self, storage_path: str) -> bool:
        return self._resolve_path(storage_path).exists()

    async def read(self, storage_path: str) -> bytes:
        full_path = self._resolve_path(storage_path)
        if not full_path.exists():
            raise StorageError(f"File not found: {storage_path}")
        async with aiofiles.open(full_path, "rb") as f:
            return await f.read()

    async def delete(self, storage_path: str) -> None:
        full_path = self._resolve_path(storage_path)
        if full_path.exists():
            full_path.unlink()
        parent = full_path.parent
        if parent.name != "uploads" and parent.exists() and not any(parent.iterdir()):
            parent.rmdir()

    async def delete_directory(self, rel_dir: str) -> None:
        import shutil

        target = self._resolve_path(rel_dir)
        if target.exists() and target.is_dir():
            shutil.rmtree(target)

    async def delete_project_directory(self, project_id: str) -> None:
        import shutil

        project_dir = self._resolve_path(project_id)
        if project_dir.exists() and project_dir.is_dir():
            shutil.rmtree(project_dir)

    async def extract_zip(self, storage_path: str, dest_dir: str) -> str:
        full_path = self._resolve_path(storage_path)
        extract_to = self._resolve_path(dest_dir)
        extract_to.mkdir(parents=True, exist_ok=True)
        try:
            with zipfile.ZipFile(full_path, "r") as zf:
                for member in zf.namelist():
                    member_path = (extract_to / member).resolve()
                    if not str(member_path).startswith(str(extract_to.resolve())):
                        raise StorageError(f"Unsafe zip entry: {member}")
                zf.extractall(extract_to)
        except zipfile.BadZipFile as e:
            raise StorageError(f"Invalid zip file: {e}") from e
        return str(extract_to)


def get_storage() -> FileStorage:
    if settings.storage_backend == "local":
        return LocalFileStorage()
    return LocalFileStorage()
