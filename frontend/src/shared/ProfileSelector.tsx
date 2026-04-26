import type { ChessProfile } from '../types/api';
import type { SelectedProfile } from './profile-selection';

interface ProfileSelectorProps {
  profiles: ChessProfile[];
  source?: string | null;
  username?: string | null;
  onChange: (profile: SelectedProfile) => void;
  id?: string;
  compact?: boolean;
  showLabel?: boolean;
}

function profileKey(source: string | null | undefined, username: string | null | undefined): string {
  if (!username) return '';
  return JSON.stringify([source ?? null, username]);
}

function parseProfileKey(value: string): SelectedProfile {
  if (!value) return { source: null, username: null };
  try {
    const parsed = JSON.parse(value) as [string | null, string];
    return { source: parsed[0], username: parsed[1] };
  } catch {
    return { source: null, username: null };
  }
}

function sourceLabel(source: string | null): string {
  if (source === 'chesscom') return 'Chess.com';
  if (source === 'lichess') return 'Lichess';
  return source || t('profiles.unknown_source');
}

function optionLabel(profile: ChessProfile): string {
  return `${sourceLabel(profile.source)} - ${profile.username} (${t('profiles.games', { count: profile.total_games })})`;
}

export function ProfileSelector({
  profiles,
  source,
  username,
  onChange,
  id = 'profileSelector',
  compact = false,
  showLabel = true,
}: ProfileSelectorProps) {
  const value = profileKey(source, username);
  const emptyLabel = profiles.length > 0 ? t('profiles.all') : t('profiles.empty');

  return (
    <div class={`profile-selector${compact ? ' profile-selector--compact' : ''}`}>
      {showLabel && <label for={id}>{t('profiles.label')}</label>}
      <select
        id={id}
        aria-label={showLabel ? undefined : t('profiles.label')}
        value={value}
        onChange={(event) => { onChange(parseProfileKey(event.currentTarget.value)); }}
      >
        <option value="">{emptyLabel}</option>
        {profiles.map(profile => (
          <option
            key={`${profile.source ?? ''}:${profile.username}`}
            value={profileKey(profile.source, profile.username)}
          >
            {optionLabel(profile)}
          </option>
        ))}
      </select>
    </div>
  );
}
