import MultisigInput from './MultisigInput';
import { useMultisigData } from '@/hooks/useMultisigData';
import Overview from '@/components/Overview';
import MultisigLookup from './MultisigLookup';
import { NoSquadSelected } from './NoSquadSelected';

interface RenderRouteProps {
  children: React.ReactNode;
}

export default function RenderMultisigRoute() {
  const { multisigAddress: multisig } = useMultisigData();

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
