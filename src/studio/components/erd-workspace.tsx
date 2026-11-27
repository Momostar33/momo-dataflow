import { SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import DatabaseLayout from "@/features/database";
export function ErdWorkspace() {
  return (
    <SidebarProvider className="studio-erd-workspace" defaultOpen={false}>
      <Header className="studio-erd-toolbar" />
      <div className="studio-erd-body">
        <DatabaseLayout />
      </div>
    </SidebarProvider>
  );
}
