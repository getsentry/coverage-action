import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, ExternalLink, Info } from "lucide-react";
import { githubService } from "../services/githubAPI";

interface TokenSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenSaved: () => void;
}

export function TokenSetup({ open, onOpenChange, onTokenSaved }: TokenSetupProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!token.trim()) {
      setError("Please enter a valid token");
      return;
    }

    // Validate token format (should start with ghp_ or github_pat_)
    if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
      setError("Invalid token format. Token should start with 'ghp_' or 'github_pat_'");
      return;
    }

    githubService.setToken(token);
    setToken("");
    setError("");
    onTokenSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            GitHub Authentication Required
          </DialogTitle>
          <DialogDescription>
            To download artifacts and view coverage data, you need to provide a GitHub Personal Access Token.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Artifacts require authentication even for public repositories. Your token is stored locally in your browser and never sent to any server other than GitHub.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div>
            <Label htmlFor="token">Personal Access Token</Label>
            <Input
              id="token"
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setError("");
              }}
              className="mt-1"
            />
            {error && (
              <p className="text-sm text-destructive mt-1">{error}</p>
            )}
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How to create a token:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)</li>
              <li>Click "Generate new token (classic)"</li>
              <li>Give it a name (e.g., "Coverage Dashboard")</li>
              <li>Select scopes: <code className="bg-muted px-1 py-0.5 rounded text-xs">repo</code> and <code className="bg-muted px-1 py-0.5 rounded text-xs">read:org</code></li>
              <li>Click "Generate token" and copy it</li>
            </ol>
            <Button
              variant="link"
              className="h-auto p-0 text-sm"
              asChild
            >
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=Coverage%20Dashboard"
                target="_blank"
                rel="noopener noreferrer"
              >
                Create Token on GitHub
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

