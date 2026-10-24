import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/api/me";

export function useMe() {
  const q = useQuery({ queryKey: ["me"], queryFn: () => getMe(), staleTime: 60_000 });
  const can = (perm: string) => !!q.data?.can?.[perm];
  return { me: q.data?.user ?? null, can, loading: q.isLoading };
}
