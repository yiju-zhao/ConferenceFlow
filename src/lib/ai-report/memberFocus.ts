export function requireAuthenticatedUserId(user: { uid: string } | null | undefined): string {
  if (!user) throw new Error("Not authenticated");
  return user.uid;
}
