export function isInstitutionalEmail(email: string) {
  return /^[^@\s]+@(?:osu\.edu|osumc\.edu)$/i.test(email);
}
export type PublicProfile = {
  display_name: string;
  show_name: boolean;
  show_nickname: boolean;
  show_email: boolean;
};
export function publicAuthor(
  user: { name: string; email: string },
  preferences: PublicProfile,
) {
  return {
    ...(preferences.show_name && preferences.display_name
      ? { name: preferences.display_name }
      : {}),
    ...(preferences.show_nickname ? { nickname: user.name } : {}),
    ...(preferences.show_email ? { email: user.email } : {}),
  };
}
