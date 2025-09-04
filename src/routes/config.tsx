import AddMemberInput from '@/components/AddMemberInput';
import ChangeThresholdInput from '@/components/ChangeThresholdInput';
import RemoveMemberButton from '@/components/RemoveMemberButton';
import EditMemberPermissions from '@/components/EditMemberPermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { clusterApiUrl } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useMultisig } from '@/hooks/useServices';
import { renderPermissions } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Suspense } from 'react';

const ConfigurationPage = () => {
  const { rpcUrl, multisigAddress, programId } = useMultisigData();
  const { data: multisigConfig } = useMultisig();

  // Check if we have a valid multisig
  if (!multisigAddress || !multisigConfig) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<div>Loading...</div>}>
          <div className="">
            <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Multisig Configuration</h1>
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                Please select a valid squad to view configuration.
              </p>
            </div>
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Check if this is a controlled multisig
  const isControlled =
    multisigConfig?.configAuthority &&
    multisigConfig.configAuthority.toBase58() !== '11111111111111111111111111111111';

  return (
    <ErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <div className="">
          <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Multisig Configuration</h1>

          {isControlled && (
            <div className="border-warning/50 bg-warning/10 mb-4 rounded-lg border p-4">
              <div className="flex items-start gap-2">
                <svg
                  className="text-warning mt-0.5 h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-warning font-semibold">Controlled Multisig</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This multisig is controlled by an external program. Configuration changes must
                    be made through the controlling authority:
                  </p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {multisigConfig?.configAuthority?.toBase58()}
                  </p>
                </div>
              </div>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                List of members in the multisig as well as their permissions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {multisigConfig &&
                  multisigConfig.members.map((member) => (
                    <div key={member.key.toBase58()} className="space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="break-all text-xs font-medium sm:text-sm">
                            <span className="text-muted-foreground">Key:</span>{' '}
                            <span className="font-mono">{member.key.toBase58()}</span>
                          </p>
                          <p className="text-xs text-muted-foreground sm:text-sm">
                            Permissions: {renderPermissions(member.permissions.mask)}
                          </p>
                        </div>
                        <div className="flex gap-2 self-end sm:self-auto">
                          <EditMemberPermissions
                            memberKey={member.key.toBase58()}
                            currentPermissions={member.permissions.mask}
                            multisigPda={multisigAddress!}
                            transactionIndex={
                              Number(multisigConfig ? multisigConfig.transactionIndex : 0) + 1
                            }
                            programId={
                              programId ? programId.toBase58() : multisig.PROGRAM_ID.toBase58()
                            }
                          />
                          <RemoveMemberButton
                            memberKey={member.key.toBase58()}
                            multisigPda={multisigAddress!}
                            transactionIndex={
                              Number(multisigConfig ? multisigConfig.transactionIndex : 0) + 1
                            }
                            programId={
                              programId ? programId.toBase58() : multisig.PROGRAM_ID.toBase58()
                            }
                          />
                        </div>
                      </div>
                      <hr />
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-4 pb-4 sm:flex-row">
            <Card className="mt-4 w-full sm:w-1/2">
              <CardHeader>
                <CardTitle>Add Member</CardTitle>
                <CardDescription>Add a member to the Multisig</CardDescription>
              </CardHeader>
              <CardContent>
                <AddMemberInput
                  multisigPda={multisigAddress!}
                  transactionIndex={
                    Number(multisigConfig ? multisigConfig.transactionIndex : 0) + 1
                  }
                  programId={programId ? programId.toBase58() : multisig.PROGRAM_ID.toBase58()}
                />
              </CardContent>
            </Card>
            <Card className="mt-4 w-full sm:w-1/2">
              <CardHeader>
                <CardTitle>Change Threshold</CardTitle>
                <CardDescription>
                  Change the threshold required to execute a multisig transaction.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {multisigConfig ? (
                  <span>Current Threshold: {multisigConfig.threshold} </span>
                ) : null}
                <ChangeThresholdInput
                  multisigPda={multisigAddress!}
                  transactionIndex={
                    Number(multisigConfig ? multisigConfig.transactionIndex : 0) + 1
                  }
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </Suspense>
    </ErrorBoundary>
  );
};

export default ConfigurationPage;
