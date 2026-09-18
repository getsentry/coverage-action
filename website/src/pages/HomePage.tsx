import { CheckCircle, FileCode, GitBranch, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseRepositoryReference } from "@/lib/repository-url";

export default function HomePage() {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const repository = parseRepositoryReference(repoUrl);
    if (repository) {
      navigate(`/${repository.owner}/${repository.repo}`);
    }
  };

  return (
    <div>
      <div className="mx-auto max-w-7xl px-6">
        {/* Hero */}
        <div className="py-16 text-center">
          <h1 className="text-5xl font-bold mb-4">Coverage Dashboard</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            View test results and code coverage metrics from your GitHub
            repositories
          </p>
        </div>

        {/* Search Card */}
        <Card className="max-w-2xl mx-auto mb-16">
          <CardHeader>
            <CardTitle>View Repository Coverage</CardTitle>
            <CardDescription>
              Enter a GitHub repository to view its coverage and test results
              over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                type="text"
                placeholder="owner/repo or github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="flex-1"
              />
              <Button type="submit">
                <GitBranch className="h-4 w-4 mr-2" />
                View
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto pb-16">
          <Card>
            <CardHeader>
              <TrendingUp className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Track Coverage Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Visualize line and branch coverage trends across multiple
                workflow runs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CheckCircle className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Test Results</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Monitor test pass rates, failures, and new tests added over time
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <FileCode className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Branch Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Compare coverage across different branches with customizable
                time ranges
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
