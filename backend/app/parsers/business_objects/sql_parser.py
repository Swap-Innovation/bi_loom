import re
from typing import Any


def parse_sql(sql: str) -> dict[str, Any]:
    tables = list(set(re.findall(r"(?:FROM|JOIN)\s+([a-zA-Z_][\w.]*)", sql, re.IGNORECASE)))
    aggregations = re.findall(r"(SUM|COUNT|AVG|MIN|MAX)\s*\(", sql, re.IGNORECASE)
    group_by = re.search(r"GROUP\s+BY\s+(.+?)(?:ORDER|HAVING|$)", sql, re.IGNORECASE | re.DOTALL)
    where_clause = re.search(r"WHERE\s+(.+?)(?:GROUP|ORDER|$)", sql, re.IGNORECASE | re.DOTALL)

    return {
        "tables": tables,
        "aggregations": list(set(aggregations)),
        "group_by": group_by.group(1).strip() if group_by else None,
        "where": where_clause.group(1).strip() if where_clause else None,
        "filters": _extract_filters(where_clause.group(1) if where_clause else ""),
    }


def _extract_filters(where: str) -> list[dict[str, str]]:
    if not where:
        return []
    filters = []
    for match in re.finditer(r"(\w+)\s*(=|!=|<>|>|<|>=|<=|IN|BETWEEN)\s*(.+?)(?:\s+AND|\s+OR|$)", where, re.IGNORECASE):
        filters.append({"field": match.group(1), "operator": match.group(2), "value": match.group(3).strip()})
    return filters
