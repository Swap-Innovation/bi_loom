import { useEffect } from 'react';
import type { ConversionItem } from '../../types';
import type { HierarchyDocument } from '../parsing/DocumentHierarchy';
import { useSelection } from '../../context/SelectionContext';

interface LinkedSelectionBridgeProps {
  items: ConversionItem[];
  documents: HierarchyDocument[];
  reports: { id: string; name: string; pages: { id: string; name: string; visuals: { id: string; name: string; type: string }[] }[] }[];
}

/** Syncs source block selection → conversion item → target visual highlight */
export function LinkedSelectionBridge({ items, documents, reports }: LinkedSelectionBridgeProps) {
  const { sourceId, sourceType, sourceData, selectConversionItem, selectTarget } = useSelection();

  useEffect(() => {
    if (sourceType !== 'block' || !sourceId) return;

    const blockItem = items.find((i) => i.source_type === 'block' && i.source_id === sourceId);
    if (blockItem) {
      selectConversionItem(blockItem.id, blockItem);
    }

    const ctx = sourceData as { documentId?: string; documentName?: string } | null;
    const docId = ctx?.documentId;
    const report = reports.find((r) => r.id === docId);
    if (report && report.pages[0]?.visuals[0]) {
      const visual = report.pages[0].visuals[0];
      selectTarget(visual.id, 'visual', visual);
    }
  }, [sourceId, sourceType, sourceData, items, reports, selectConversionItem, selectTarget]);

  useEffect(() => {
    for (const doc of documents) {
      for (const page of doc.pages) {
        for (const block of page.blocks) {
          if (block.id === sourceId && sourceType === 'block') {
            return;
          }
        }
      }
    }
  }, [documents, sourceId, sourceType]);

  return null;
}
