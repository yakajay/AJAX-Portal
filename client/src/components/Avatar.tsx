import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

export interface AvatarPerson { id: string; name: string; avatarVersion?: number | null }

export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

// Photos need the Authorization header, so they are fetched as blobs. One fetch per person and version, shared by every Avatar.
const cache = new Map<string, Promise<string | null>>();
const load = (id: string, version: number): Promise<string | null> => {
  const key = `${id}:${version}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = apiFetch(`/user/avatars/${id}?v=${version}`)
      .then(async (res) => (res.ok ? URL.createObjectURL(await res.blob()) : null))
      .catch(() => null);
    cache.set(key, hit);
  }
  return hit;
};

/**
 * The person's photo, or their initials when they have none. Renders the content only: put it inside a
 * sized, rounded, overflow-hidden box of your own so each place keeps its look.
 */
export const Avatar = ({ person, initials }: { person: AvatarPerson; initials?: string }) => {
  const version = person.avatarVersion ?? null;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSrc(null);
    if (version) void load(person.id, version).then((url) => live && setSrc(url));
    return () => { live = false; };
  }, [person.id, version]);

  return src
    ? <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
    : <>{initials ?? initialsOf(person.name)}</>;
};
