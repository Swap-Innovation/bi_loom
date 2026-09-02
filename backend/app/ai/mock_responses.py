from typing import Type

from pydantic import BaseModel, Field


class MappingCandidate(BaseModel):
    target_table: str | None = None
    target_column: str | None = None
    target_measure: str | None = None
    target_expression: str | None = None
    confidence: float = 0.0
    reasoning: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    recommendation: str = ""


class AIMappingResult(BaseModel):
    source_name: str
    source_type: str
    target_table: str | None = None
    target_column: str | None = None
    target_measure: str | None = None
    target_expression: str | None = None
    confidence: float = 0.0
    confidence_level: str = "LOW"
    reasoning: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    recommendation: str = ""


MOCK_MAPPINGS = {
    "CUSTOMER_ID": {
        "target_table": "DimCustomer", "target_column": "CustomerKey",
        "confidence": 94, "confidence_level": "HIGH",
        "reasoning": ["Semantic name similarity", "Compatible data type", "Used in equivalent join context"],
        "evidence": ["Name match: CUSTOMER_ID → CustomerKey", "Glossary term: Customer"],
    },
    "ORDER_VALUE": {
        "target_table": "FactOrder", "target_column": "OrderAmount",
        "confidence": 87, "confidence_level": "MEDIUM",
        "reasoning": ["Semantic name similarity", "Business glossary match: Revenue"],
        "evidence": ["Glossary: Revenue → OrderAmount", "SQL aggregation context"],
    },
    "PRODUCT_NAME": {
        "target_table": "DimProduct", "target_column": "ProductName",
        "confidence": 96, "confidence_level": "HIGH",
        "reasoning": ["Exact normalized name match", "Same data type"],
        "evidence": ["Normalized match: productname"],
    },
    "ORDER_DATE": {
        "target_table": "FactOrder", "target_column": "OrderDate",
        "confidence": 92, "confidence_level": "HIGH",
        "reasoning": ["Name similarity", "Date type compatibility"],
        "evidence": ["Field used in date filter context"],
    },
    "REVENUE": {
        "target_table": "FactOrder", "target_measure": "TotalRevenue",
        "confidence": 91, "confidence_level": "HIGH",
        "reasoning": ["Business glossary match", "Measure aggregation compatible"],
        "evidence": ["Glossary: Revenue → TotalRevenue measure"],
    },
    "REGION": {
        "target_table": "DimCustomer", "target_column": "Region",
        "confidence": 95, "confidence_level": "HIGH",
        "reasoning": ["Exact name match"],
        "evidence": ["Direct column name match"],
    },
    "ORDER_COUNT": {
        "target_table": "FactOrder", "target_measure": "OrderCount",
        "confidence": 88, "confidence_level": "MEDIUM",
        "reasoning": ["Count aggregation maps to existing measure"],
        "evidence": ["SQL COUNT() → OrderCount measure"],
    },
}


def get_mock_response(prompt: str, schema: Type[BaseModel]) -> BaseModel:
    for key, mapping in MOCK_MAPPINGS.items():
        if key in prompt.upper():
            return schema.model_validate({
                "source_name": key,
                "source_type": "column" if "measure" not in mapping else "measure",
                **mapping,
            })
    return schema.model_validate({
        "source_name": "UNKNOWN",
        "source_type": "column",
        "confidence": 45,
        "confidence_level": "LOW",
        "reasoning": ["No strong match found"],
        "evidence": ["Manual review required"],
        "recommendation": "Review manually and select appropriate Pluto field",
    })
