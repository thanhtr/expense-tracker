'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface HouseholdMember { id: number; name: string; slug: string; }

type Ctx = {
  members: HouseholdMember[];
  nameForSlug: (slug: string) => string;
};

const HouseholdCtx = createContext<Ctx>({ members: [], nameForSlug: s => s });

export function HouseholdMembersProvider({ children }: { children: React.ReactNode }) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  useEffect(() => {
    fetch('/api/household-members')
      .then(r => r.ok ? r.json() as Promise<HouseholdMember[]> : [])
      .then(setMembers)
      .catch(() => {});
  }, []);

  const nameForSlug = (slug: string) =>
    members.find(m => m.slug === slug)?.name ?? slug;

  return (
    <HouseholdCtx.Provider value={{ members, nameForSlug }}>
      {children}
    </HouseholdCtx.Provider>
  );
}

export const useHouseholdMembers = () => useContext(HouseholdCtx);
