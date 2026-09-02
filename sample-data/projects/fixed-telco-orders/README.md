# Fixed Telco Orders — Sample Project

Per-project sample layout used by Migration AI demos.

## Folder structure

```
fixed-telco-orders/
├── project.json          # Project template metadata
├── artifacts/            # Upload these via Ingest → Upload Assets
│   └── fixed-telco-orders.zip
├── source/               # Reference BO export (contents of the ZIP)
│   └── business-objects/
│       ├── manifest.json
│       └── reports/
└── target/               # Import via Target phase
    ├── pluto-model.json
    └── glossary.json
```

## Ingest flow

1. **Upload Assets** — upload `artifacts/fixed-telco-orders.zip`
2. **Parsing** — run full parse or select documents case-by-case
3. **MSpec** — review generated migration specification
