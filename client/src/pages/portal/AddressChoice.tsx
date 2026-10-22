import { inputClass } from '../../components/ui';

/** Where a client signs in: the shared address (trial and basic clients) or their own subdomain (paid clients). */
const AddressChoice = ({ plan, dedicated, onDedicated, slug, onSlug, shared, base, slugLocked = false }: {
  plan: string; dedicated: boolean; onDedicated: (on: boolean) => void; slug?: string; onSlug?: (slug: string) => void;
  shared: string; base: string; slugLocked?: boolean;
}) => {
  const trial = plan === 'trial';
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-extrabold text-slate-900 mb-1">Sign-in address</legend>
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="radio" className="mt-1" name="address" checked={!dedicated || trial} onChange={() => onDedicated(false)} />
        <span><span className="font-bold text-slate-900">Shared address · {shared}</span><br />Trial and basic clients sign in here with their email; the roles on their account decide what they see.</span>
      </label>
      <label className={`flex items-start gap-3 text-sm ${trial ? 'text-slate-400' : 'text-slate-700'}`}>
        <input type="radio" className="mt-1" name="address" disabled={trial} checked={dedicated && !trial} onChange={() => onDedicated(true)} />
        <span><span className="font-bold">Own address{slug ? ` · ${slug}.${base}` : ''}</span><br />{trial ? 'Available once the client is on a paid plan.' : 'Paid clients get their own subdomain. People who sign in at the shared address are sent here.'}</span>
      </label>
      {dedicated && !trial && onSlug && (
        <div className="ml-7 flex items-center gap-2">
          <input aria-label="Subdomain" className={`${inputClass} max-w-52`} placeholder="angelone" disabled={slugLocked} value={slug ?? ''} onChange={(e) => onSlug(e.target.value.toLowerCase())} />
          <span className="text-sm text-slate-500">.{base}</span>
        </div>
      )}
    </fieldset>
  );
};

export default AddressChoice;
