import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { FileText, Download, Trash2, Upload } from "lucide-react";
import { UploadDocumentDialog } from "./UploadDocumentDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getDocumentUrl, removeDocumentObject } from "@/lib/documents";
import { getErrorMessage } from "@/lib/errors";

interface DocumentsTabProps {
  entityType: string;
  entityId: string;
  schoolId: string;
  orgId: string;
}

export function DocumentsTab({ entityType, entityId, schoolId, orgId }: DocumentsTabProps) {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);

  const canDelete = userRole !== "parent" && userRole !== "teacher";

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents", entityType, entityId],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_files")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  type DocumentRow = (typeof documents)[number];

  const handleDownload = async (doc: DocumentRow) => {
    try {
      // Documents live in a private bucket, so the link is minted on demand.
      const url = await getDocumentUrl(doc.file_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not open this document"));
    }
  };

  const handleDelete = async (doc: DocumentRow) => {
    await removeDocumentObject(doc.file_url);
    const { error } = await supabase.from("document_files").delete().eq("id", doc.id);
    if (error) toast.error("Failed to delete document");
    else {
      toast.success("Document deleted");
      queryClient.invalidateQueries({ queryKey: ["documents", entityType, entityId] });
      // Audit log
      supabase.from("audit_logs").insert({
        org_id: orgId,
        user_id: user?.id,
        entity_type: "document",
        entity_id: doc.id,
        action: "delete",
        detail: `Deleted document: ${doc.file_name}`,
      });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Documents
        </CardTitle>
        {userRole !== "parent" && (
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-3.5 w-3.5" /> Upload
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents"
            description="Attach certificates, identification, contracts or receipts to keep them with this record."
            {...(userRole !== "parent" ? { actionLabel: "Upload a document", onAction: () => setUploadOpen(true) } : {})}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.file_name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{doc.category || "general"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatSize(doc.file_size || 0)}</TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(doc.created_at), "dd MMM yyyy")}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(doc)} title="Download">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                              <AlertDialogDescription>
                                &ldquo;{doc.file_name}&rdquo; will be permanently removed from this record.
                                This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(doc)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        entityType={entityType}
        entityId={entityId}
        schoolId={schoolId}
        orgId={orgId}
      />
    </Card>
  );
}
