import SetProgramIdInput from '@/components/SetProgramIdInput';
import SetRpcUrlInput from '@/components/SetRpcUrlnput';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SetExplorerInput from '../components/SetExplorerInput';
import { ThemeSelector } from '@/components/ThemeSelector';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Suspense } from 'react';

const SettingsPage = () => {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <main>
          <h1 className="mb-4 text-3xl font-bold">Settings</h1>
          <div className="flex-col justify-start space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Theme</CardTitle>
                <CardDescription>Choose your preferred color theme.</CardDescription>
              </CardHeader>
              <CardContent>
                <ThemeSelector />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>RPC Url</CardTitle>
                <CardDescription>Change the default RPC Url for this app.</CardDescription>
              </CardHeader>
              <CardContent>
                <SetRpcUrlInput />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Program ID</CardTitle>
                <CardDescription>Change the targeted program ID.</CardDescription>
              </CardHeader>
              <CardContent>
                <SetProgramIdInput />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Explorer</CardTitle>
                <CardDescription>Change the explorer.</CardDescription>
              </CardHeader>
              <CardContent>
                <SetExplorerInput />
              </CardContent>
            </Card>
          </div>
        </main>
      </Suspense>
    </ErrorBoundary>
  );
};

export default SettingsPage;
