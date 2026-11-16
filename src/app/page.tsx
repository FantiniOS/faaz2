import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth-session";

export default async function HomePage() {
  const sessao = await getSessao();

  if (sessao) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
