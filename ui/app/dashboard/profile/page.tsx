"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export default function ProfilePage() {
  const { user, logout } = useAuth();

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="text-muted-foreground">Name</div>
          <div className="font-medium">{user?.name}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Email</div>
          <div className="font-medium">{user?.email}</div>
        </div>
        <Button variant="outline" onClick={() => void logout().then(() => (window.location.href = "/"))}>
          Log out
        </Button>
      </CardContent>
    </Card>
  );
}
