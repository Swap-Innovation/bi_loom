from typing import Any


class AppException(Exception):
    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None, status_code: int = 400):
        self.code = code
        self.message = message
        self.details = details or {}
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found", details: dict[str, Any] | None = None):
        super().__init__("NOT_FOUND", message, details, 404)


class ParserError(AppException):
    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__("PARSER_ERROR", message, details, 422)


class ValidationError(AppException):
    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__("VALIDATION_ERROR", message, details, 422)


class StorageError(AppException):
    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__("STORAGE_ERROR", message, details, 500)
