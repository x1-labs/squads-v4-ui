import MultisigInput from './MultisigInput';
import { useMultisigData } from '@/hooks/useMultisigData';
import Overview from '@/components/Overview';
import MultisigLookup from './MultisigLookup';
import { NoSquadSelected } from './NoSquadSelected';
import { useParams } from 'react-router-dom';

interface RenderRouteProps {
  children: React.ReactNode;
}

export default function RenderMultisigRoute() {
  const params = useParams<{ multisigAddress?: string }>();
  const { multisigAddress: multisig } = useMultisigData();
  
  // If we're on the root path (no multisigAddress in URL), show the NoSquadSelected component
  if (!params.multisigAddress) {
    return <NoSquadSelected />;
  }

  return (
    <>
      {multisig ? (
        <div>
          <Overview />
        </div>
      ) : (
        <NoSquadSelected />
      )}
    </>
  );
}
