import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { client } from '../shared/api';
import { ProfileSelector } from '../shared/ProfileSelector';
import {
  loadSelectedProfile,
  saveSelectedProfile,
  type SelectedProfile,
} from '../shared/profile-selection';
import type { ChessProfile } from '../types/api';

function HeaderProfileSelector() {
  const [profiles, setProfiles] = useState<ChessProfile[]>([]);
  const [selected, setSelected] = useState<SelectedProfile>(loadSelectedProfile);

  useEffect(() => {
    let cancelled = false;
    client.profiles.list().then(result => {
      if (!cancelled) setProfiles(result.items);
    }).catch((err: unknown) => {
      console.error('Failed to load chess profiles:', err);
    });
    return () => { cancelled = true; };
  }, []);

  function handleChange(profile: SelectedProfile) {
    setSelected(saveSelectedProfile(profile));
  }

  return (
    <div class="profile-header">
      <ProfileSelector
        id="globalProfileSelector"
        compact
        showLabel={false}
        profiles={profiles}
        source={selected.source}
        username={selected.username}
        onChange={handleChange}
      />
      <a class="profile-add-btn" href="/management" title={t('profiles.add')} aria-label={t('profiles.add')}>
        +
      </a>
    </div>
  );
}

const root = document.getElementById('profile-header-root');
if (root) {
  render(<HeaderProfileSelector />, root);
}
