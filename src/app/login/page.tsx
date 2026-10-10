import Login from "@/components/Login";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <Login
      destination={
        typeof next === "string" && next.startsWith("/?") ? next : "/"
      }
    />
  );
}
