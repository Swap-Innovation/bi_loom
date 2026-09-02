# API Reference

Base URL: `/api/v1`

All endpoints return a standard envelope:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "request_id": "uuid"
}
```

## Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects` | Create migration project |
| GET | `/projects` | List all projects |
| GET | `/projects/{id}` | Get project details |
| DELETE | `/projects/{id}` | Delete project |

**Create Project Request:**
```json
{
  "name": "Fixed Telco Orders",
  "description": "Migration POC",
  "source_technology": "SAP Business Objects",
  "target_technology": "Power BI"
}
```

## Artifacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/artifacts` | Upload BO export (multipart) |
| GET | `/projects/{id}/artifacts` | List uploaded artifacts |

## Parsing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/parse` | Start parsing (async, returns job_id) |
| GET | `/projects/{id}/parse-status` | Get parse progress |

## MSpec

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/{id}/mspec` | Get full MSpec document |
| GET | `/projects/{id}/mspec/reports` | List reports in MSpec |
| GET | `/projects/{id}/mspec/reports/{report_id}` | Get single report |

## Pluto Model

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/pluto-model` | Import Pluto model (JSON file) |
| GET | `/projects/{id}/pluto-model` | Get imported model |
| POST | `/projects/{id}/glossary` | Import business glossary |
| GET | `/projects/{id}/glossary` | Get glossary terms |

## AI Mapping

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/mapping/run` | Start AI mapping (async) |
| GET | `/projects/{id}/mapping` | List all mappings |
| GET | `/projects/{id}/mapping/{mapping_id}` | Get mapping detail |
| POST | `/projects/{id}/mapping/{mapping_id}/approve` | Approve mapping |
| POST | `/projects/{id}/mapping/{mapping_id}/reject` | Reject mapping |
| PUT | `/projects/{id}/mapping/{mapping_id}` | Modify mapping target |

## Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/generate` | Start PBI generation (async) |
| GET | `/projects/{id}/generation-status` | Get generation status |

## Validation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/validate` | Start validation (async) |
| GET | `/projects/{id}/validation` | Get validation results |

## Results

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Dashboard aggregate stats |
| GET | `/projects/{id}/results` | Migration results summary |
| GET | `/projects/{id}/download` | Download migration package (ZIP) |
| GET | `/jobs/{job_id}` | Poll async job status |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| NOT_FOUND | 404 | Resource not found |
| PARSER_ERROR | 422 | Parser failure |
| VALIDATION_ERROR | 422 | Input validation failure |
| STORAGE_ERROR | 500 | File storage failure |

## Example: Full Demo Flow

```bash
# 1. Create project
curl -X POST http://localhost:8000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Demo Migration"}'

# 2. Upload artifact
curl -X POST http://localhost:8000/api/v1/projects/{id}/artifacts \
  -F "file=@sample-data/fixed-telco-orders.zip"

# 3. Parse
curl -X POST http://localhost:8000/api/v1/projects/{id}/parse

# 4. Import Pluto model
curl -X POST http://localhost:8000/api/v1/projects/{id}/pluto-model \
  -F "file=@sample-data/pluto/pluto-model.json"

# 5. Run mapping
curl -X POST http://localhost:8000/api/v1/projects/{id}/mapping/run

# 6. Approve mapping
curl -X POST http://localhost:8000/api/v1/projects/{id}/mapping/{mapping_id}/approve

# 7. Generate & validate
curl -X POST http://localhost:8000/api/v1/projects/{id}/generate
curl -X POST http://localhost:8000/api/v1/projects/{id}/validate

# 8. Download
curl -O http://localhost:8000/api/v1/projects/{id}/download
```
