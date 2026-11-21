// Signed-in account (Supabase Auth): Google or an email magic link. Guests never need this.
import { create } from 'zustand';
import { cloudConfigured, sb } from '../lib/cloud/client';

export interface Profile { id: string; display_name: string; avatar_url: string | null; upi_id: string | null; phone: string | null; share_contact: boolean }
interface AuthState {
  ready: boolean;
  user: { id: string; email?: string } | null;
  profile: Profile | null;
  init: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (p: Partial<Omit<Profile, 'id'>>) => Promise<void>;
}

let started = false;
export const useAuth = create<AuthState>()((set, get) => ({
  ready: !cloudConfigured(),
  user: null,
  profile: null,
  async init() {
    if (started) return;
    started = true;
    const c = await sb();
    if (!c) { set({ ready: true }); return; }
    const load = async (uid: string | undefined, email?: string) => {
      if (!uid) { set({ user: null, profile: null, ready: true }); return; }
      const { data } = await c.from('profiles').select('id,display_name,avatar_url,upi_id,phone,share_contact').eq('id', uid).maybeSingle();
      set({ user: { id: uid, email }, profile: (data as Profile) || null, ready: true });
    };
    const { data } = await c.auth.getSession();
    await load(data.session?.user.id, data.session?.user.email);
    c.auth.onAuthStateChange((_e, s) => { if ((s?.user.id || null) !== (get().user?.id || null)) void load(s?.user.id, s?.user.email); });
  },
  async signInGoogle() {
    const c = await sb();
    await c?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
  },
  async signInEmail(email) {
    const c = await sb();
    const { error } = (await c?.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } })) || {};
    if (error) throw new Error(error.message);
  },
  async signOut() {
    const c = await sb();
    await c?.auth.signOut();
    set({ user: null, profile: null });
  },
  async saveProfile(p) {
    const c = await sb();
    const id = get().user?.id;
    if (!c || !id) return;
    const { data, error } = await c.from('profiles').update(p).eq('id', id).select('id,display_name,avatar_url,upi_id,phone,share_contact').single();
    if (error) throw new Error('Couldn’t save your profile');
    set({ profile: data as Profile });
  },
}));
