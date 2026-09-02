import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Layout } from './components/layout/Layout';
import { ProjectShell } from './components/layout/ProjectShell';
import { AiActivityProvider } from './context/AiActivityContext';
import { JobTrayProvider } from './context/JobTrayContext';
import { SelectionProvider } from './context/SelectionContext';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectOverview } from './pages/ProjectOverview';
import { UploadPage } from './pages/Upload';
import { ParsingPage } from './pages/Parsing';
import { MappingPage } from './pages/Mapping';
import { TargetModelPage } from './pages/target/TargetModel';
import { ConversionPage } from './pages/Conversion';
import { IngestMspecPage } from './pages/ingest/Mspec';
import { ResultsPage } from './pages/Results';
import { Integrations } from './pages/Integrations';
import { IngestIndexPage } from './pages/ingest/IngestIndex';
import { DeliverIndexPage } from './pages/deliver/DeliverIndex';
import { GeneratePage } from './pages/deliver/Generate';
import { ValidatePage } from './pages/deliver/Validate';
import { PhaseRouteGuard } from './components/navigation/PhaseRouteGuard';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5000 } },
});

function LegacyRedirect({ segment }: { segment: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/projects/${projectId}/${segment}`} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AiActivityProvider>
        <JobTrayProvider>
          <BrowserRouter>
            <Toaster position="top-right" richColors closeButton />
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/integrations" element={<Integrations />} />

                <Route path="/projects/:projectId" element={<ProjectShell />}>
                  <Route index element={<Navigate to="overview" replace />} />
                  <Route path="overview" element={<ProjectOverview />} />

                  <Route path="ingest" element={<PhaseRouteGuard phaseId="ingest"><IngestIndexPage /></PhaseRouteGuard>} />
                  <Route path="ingest/index" element={<PhaseRouteGuard phaseId="ingest"><IngestIndexPage /></PhaseRouteGuard>} />
                  <Route path="ingest/artifacts" element={<PhaseRouteGuard phaseId="ingest" ingestStep="upload"><UploadPage /></PhaseRouteGuard>} />
                  <Route path="ingest/parsing" element={<PhaseRouteGuard phaseId="ingest" ingestStep="parsing"><ParsingPage /></PhaseRouteGuard>} />
                  <Route path="ingest/mspec" element={<PhaseRouteGuard phaseId="ingest" ingestStep="mspec"><IngestMspecPage /></PhaseRouteGuard>} />

                  <Route path="target" element={<PhaseRouteGuard phaseId="target"><TargetModelPage /></PhaseRouteGuard>} />

                  <Route path="map" element={<PhaseRouteGuard phaseId="map"><MappingPage /></PhaseRouteGuard>} />

                  <Route path="convert" element={<PhaseRouteGuard phaseId="convert"><SelectionProvider><ConversionPage /></SelectionProvider></PhaseRouteGuard>} />

                  <Route path="deliver" element={<PhaseRouteGuard phaseId="deliver"><DeliverIndexPage /></PhaseRouteGuard>} />
                  <Route path="deliver/generate" element={<PhaseRouteGuard phaseId="deliver" deliverStep="generate"><GeneratePage /></PhaseRouteGuard>} />
                  <Route path="deliver/validate" element={<PhaseRouteGuard phaseId="deliver" deliverStep="validate"><ValidatePage /></PhaseRouteGuard>} />
                  <Route path="deliver/results" element={<PhaseRouteGuard phaseId="deliver" deliverStep="results"><ResultsPage /></PhaseRouteGuard>} />

                  <Route path="artifacts" element={<LegacyRedirect segment="ingest/artifacts" />} />
                  <Route path="parsing" element={<LegacyRedirect segment="ingest/parsing" />} />
                  <Route path="mspec" element={<LegacyRedirect segment="ingest/mspec" />} />
                  <Route path="target-model" element={<LegacyRedirect segment="target" />} />
                  <Route path="mapping" element={<LegacyRedirect segment="map" />} />
                  <Route path="conversion" element={<LegacyRedirect segment="convert" />} />
                  <Route path="validation" element={<LegacyRedirect segment="deliver/validate" />} />
                  <Route path="results" element={<LegacyRedirect segment="deliver/results" />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </JobTrayProvider>
      </AiActivityProvider>
    </QueryClientProvider>
  );
}
