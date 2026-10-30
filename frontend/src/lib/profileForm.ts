import type { ProfileInput } from './types';

export interface ProfileFormState {
  officialUsername: string;
  accountAgeDays: string;
  followers: string;
  following: string;
  posts: string;
  bio: string;
  hasProfileImage: '' | 'true' | 'false';
  externalLink: '' | 'true' | 'false';
  verified: '' | 'true' | 'false';
  imageSimilarity: string;
  repeatedContent: string;
}

export const EMPTY_FORM: ProfileFormState = {
  officialUsername: '',
  accountAgeDays: '',
  followers: '',
  following: '',
  posts: '',
  bio: '',
  hasProfileImage: '',
  externalLink: '',
  verified: '',
  imageSimilarity: '',
  repeatedContent: '',
};

export type FormErrors = Partial<Record<keyof ProfileFormState, string>>;

const tri = (v: '' | 'true' | 'false'): boolean | null => (v === '' ? null : v === 'true');

function num(
  raw: string,
  opts: { min: number; max: number; integer?: boolean; label: string },
): { value: number | null; error?: string } {
  if (raw.trim() === '') return { value: null }; // blank = UNAVAILABLE, never zero
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value: null, error: `${opts.label} must be a number.` };
  if (opts.integer && !Number.isInteger(n)) return { value: null, error: `${opts.label} must be a whole number.` };
  if (n < opts.min || n > opts.max) return { value: null, error: `${opts.label} must be between ${opts.min} and ${opts.max}.` };
  return { value: n };
}

/** Blank fields become null (UNAVAILABLE). Returns validation errors or the profile payload. */
export function buildProfile(
  handle: string,
  f: ProfileFormState,
): { ok: true; profile: ProfileInput } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const age = num(f.accountAgeDays, { min: 0, max: 40000, label: 'Account age' });
  const followers = num(f.followers, { min: 0, max: 1e10, integer: true, label: 'Followers' });
  const following = num(f.following, { min: 0, max: 1e10, integer: true, label: 'Following' });
  const posts = num(f.posts, { min: 0, max: 1e8, integer: true, label: 'Posts' });
  const imageSim = num(f.imageSimilarity, { min: 0, max: 1, label: 'Image similarity' });
  const repeated = num(f.repeatedContent, { min: 0, max: 1, label: 'Repeated-content ratio' });
  if (age.error) errors.accountAgeDays = age.error;
  if (followers.error) errors.followers = followers.error;
  if (following.error) errors.following = following.error;
  if (posts.error) errors.posts = posts.error;
  if (imageSim.error) errors.imageSimilarity = imageSim.error;
  if (repeated.error) errors.repeatedContent = repeated.error;

  const official = f.officialUsername.trim().replace(/^@/, '');
  if (official && !/^[A-Za-z0-9._]{1,64}$/.test(official)) {
    errors.officialUsername = 'Use letters, numbers, dots and underscores only.';
  }
  if (f.bio.length > 2000) errors.bio = 'Bio is limited to 2000 characters.';
  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    profile: {
      username: handle,
      official_username: official || null,
      account_age_days: age.value,
      followers: followers.value,
      following: following.value,
      posts: posts.value,
      bio: f.bio.trim() === '' ? null : f.bio.trim(),
      has_profile_image: tri(f.hasProfileImage),
      external_link_present: tri(f.externalLink),
      verified: tri(f.verified),
      image_similarity: imageSim.value,
      repeated_content_ratio: repeated.value,
    },
  };
}
