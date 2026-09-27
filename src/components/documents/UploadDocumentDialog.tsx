import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { DOCUMENTS_BUCKET, storagePathFor } from "@/lib/documents";

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: string;
  schoolId: string;
  orgId: string;
}

const CATEGORIES = ["general", "identification", "certificate", "medical", "financial", "contract", "other"];

export function UploadDocumentDialog({ open, onOpenChange, entityType, entityId, schoolId, orgId }: UploadDocumentDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("general");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);

    const storagePath = storagePathFor(schoolId, entityType, entityId, file.name);

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      // Never an overwrite: the path carries a timestamp. Upsert would also need
      // the storage UPDATE policy, which teachers and the office do not hold.
      .upload(storagePath, file, { upsert: false });

    if (uploadError) {
      toast.error("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }

    // Stores the storage path, not a public URL: the bucket is private and each
    // download is opened through a short-lived signed URL instead.
    const { error } = await supabase.from("document_files").insert({
      org_id: orgId,
      school_id: schoolId,
      entity_type: entityType,
      entity_id: entityId,
      file_name: file.name,
      file_url: storagePath,
      file_size: file.size,
      category,
      notes: notes.trim() || null,
      uploaded_by: user.id,
    });

    if (error) {
      toast.error("Failed to save document record");
    } else {
      toast.success("Document uploaded");
      // Audit log
      supabase.from("audit_logs").insert({
        org_id: orgId,
        user_id: user.id,
        entity_type: "document",
        entity_id: entityId,
        action: "upload",
        detail: `Uploaded document: ${file.name}`,
      });
      queryClient.invalidateQueries({ queryKey: ["documents", entityType, entityId] });
      onOpenChange(false);
      setFile(null);
      setNotes("");
      setCategory("general");
    }
    setUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>File</Label>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div
              className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-4 transition-colors hover:border-accent"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : "Click to select a file"}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about this document..." rows={2} />
          </div>
          <Button onClick={handleUpload} disabled={!file || uploading} className="w-full">
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload Document
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
