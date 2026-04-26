import { STORAGE_KEYS } from './storage-keys';

export interface SelectedProfile {
  source: string | null;
  username: string | null;
}

const PROFILE_CHANGED_EVENT = 'blunder-tutor:profile-changed';

function normalizeProfile(profile: SelectedProfile): SelectedProfile {
  const source = profile.source?.trim() || null;
  const username = profile.username?.trim() || null;
  return { source, username };
}

export function loadSelectedProfile(): SelectedProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.selectedProfile);
    if (!raw) return { source: null, username: null };
    const parsed = JSON.parse(raw) as SelectedProfile;
    return normalizeProfile(parsed);
  } catch {
    return { source: null, username: null };
  }
}

export function saveSelectedProfile(profile: SelectedProfile): SelectedProfile {
  const normalized = normalizeProfile(profile);
  localStorage.setItem(STORAGE_KEYS.selectedProfile, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT, { detail: normalized }));
  return normalized;
}

export function selectedProfileParams(
  profile: SelectedProfile,
): { source?: string; username?: string } {
  const normalized = normalizeProfile(profile);
  const params: { source?: string; username?: string } = {};
  if (normalized.source) params.source = normalized.source;
  if (normalized.username) params.username = normalized.username;
  return params;
}

export function onSelectedProfileChange(
  callback: (profile: SelectedProfile) => void,
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<SelectedProfile>;
    callback(normalizeProfile(customEvent.detail));
  };
  window.addEventListener(PROFILE_CHANGED_EVENT, handler);
  return () => { window.removeEventListener(PROFILE_CHANGED_EVENT, handler); };
}
