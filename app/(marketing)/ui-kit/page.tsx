import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastDemo } from "./toast-demo";

// TEMPORARY (A0.1): shows every base component on the Rentify tokens.
// Remove once real screens use them.
export const metadata: Metadata = {
  title: "UI kit (temporary) | Rentify",
  robots: { index: false, follow: false },
};

const swatches = [
  ["bg-brand", "brand"],
  ["bg-brand-strong", "brand-strong"],
  ["bg-surface-muted", "surface-muted"],
  ["bg-surface-tint", "surface-tint"],
  ["bg-fg-body", "fg-body"],
  ["bg-fg-secondary", "fg-secondary"],
  ["bg-destructive", "destructive"],
] as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

export default function UiKitPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-semibold text-fg">UI kit</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Temporary page for A0.1. Every component below uses the draft Rentify
          tokens from <code>app/globals.css</code>.
        </p>
      </div>

      <Section title="Colors">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {swatches.map(([className, name]) => (
            <li key={name} className="flex items-center gap-2 text-sm">
              <span
                className={`size-8 rounded-md border border-border ${className}`}
              />
              {name}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Rent now</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete listing</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Requested</Badge>
          <Badge variant="secondary">7 days</Badge>
          <Badge variant="outline">2 weeks</Badge>
          <Badge variant="destructive">Disputed</Badge>
        </div>
      </Section>

      <Section title="Form fields">
        <form className="grid max-w-xl gap-4">
          <div className="grid gap-2">
            <Label htmlFor="kit-title">Listing title</Label>
            <Input id="kit-title" placeholder="e.g. DJI Mavic Air 2" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kit-category">Category</Label>
            <Select>
              <SelectTrigger id="kit-category" className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phones">Phones</SelectItem>
                <SelectItem value="laptops">Laptops</SelectItem>
                <SelectItem value="cameras">Cameras</SelectItem>
                <SelectItem value="drones">Drones</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kit-description">Description</Label>
            <Textarea
              id="kit-description"
              placeholder="Condition, what's included, pickup notes"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kit-price">Daily price (PHP)</Label>
            <Input
              id="kit-price"
              type="number"
              aria-invalid="true"
              aria-describedby="kit-price-error"
              defaultValue="-1"
            />
            <p id="kit-price-error" className="text-sm text-destructive">
              Enter a price above 0.
            </p>
          </div>
        </form>
      </Section>

      <Section title="Card">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Acer Nitro 5</CardTitle>
            <CardDescription>Intel Core i5, 8GB RAM, 256GB SSD</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-lg font-semibold text-fg">PHP 500 / day</span>
            <Badge variant="secondary">7 days</Badge>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Request to book</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="renting" className="max-w-xl">
          <TabsList>
            <TabsTrigger value="renting">Renting</TabsTrigger>
            <TabsTrigger value="hosting">Hosting</TabsTrigger>
          </TabsList>
          <TabsContent value="renting" className="text-sm">
            Bookings where you are the renter.
          </TabsContent>
          <TabsContent value="hosting" className="text-sm">
            Bookings for your listings.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-fit">
              Cancel rental
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel rental confirmation</DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel the rental of FUJIFILM X-T1?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Keep booking</Button>
              </DialogClose>
              <Button>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Toasts">
        <ToastDemo />
      </Section>
    </div>
  );
}
