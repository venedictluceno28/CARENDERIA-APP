import { useState } from 'react'
import { FontSizeControl } from '../components/layout/FontPreferenceProvider'
import {
  AppBackground,
  MobileStickyAction,
  PageContainer,
} from '../components/layout/Page'
import { StoreIdentity } from '../components/layout/StoreIdentity'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from '../components/ui/Feedback'
import {
  ChoiceCard,
  Field,
  Input,
  Select,
  Textarea,
} from '../components/ui/FormControls'
import { Card, GlassSurface, SectionHeading } from '../components/ui/Surface'
import { formatDeliveryCharge, formatPeso } from '../lib/format-money'

export function DesignSystemPage() {
  const [dialogOpen, setDialogOpen] = useState(
    () => new URLSearchParams(window.location.search).get('dialog') === 'open',
  )
  return (
    <AppBackground>
      <main>
        <PageContainer className="showcase">
          <header className="showcase__intro">
            <p className="eyebrow">Development preview</p>
            <h1>Tindahan design system</h1>
            <p>
              Shared visual primitives for clear, comfortable mobile ordering
              and store operations.
            </p>
          </header>

          <section>
            <SectionHeading
              title="Brand and type"
              description="Atmospheric blues support the content; readable surfaces remain the priority."
            />
            <GlassSurface className="showcase__grid">
              <StoreIdentity subtitle="Fresh meals, made nearby" />
              <div>
                <p className="display-title">Display title</p>
                <h2>Page heading</h2>
                <h3>Section heading</h3>
                <p>Body copy stays comfortable on narrow Android screens.</p>
                <small className="supporting-text">
                  Supporting text and metadata
                </small>
              </div>
              <FontSizeControl />
            </GlassSurface>
          </section>

          <section>
            <SectionHeading title="Actions" />
            <Card className="showcase__row">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="glass">Glass</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button loading>Saving</Button>
              <Button disabled>Disabled</Button>
            </Card>
          </section>

          <section>
            <SectionHeading
              title="Forms"
              description="Native controls keep mobile keyboards and assistive technology behavior predictable."
            />
            <Card>
              <div className="form-grid">
                <Field htmlFor="name" label="Customer name" required>
                  <Input id="name" placeholder="e.g. Maria Santos" />
                </Field>
                <Field htmlFor="area" label="Delivery area">
                  <Select id="area" defaultValue="marycris">
                    <option value="marycris">Marycris Complex</option>
                    <option>Wellington Place</option>
                    <option>Elliston Place</option>
                    <option>Outside these areas</option>
                  </Select>
                </Field>
                <Field
                  htmlFor="notes"
                  label="Delivery notes"
                  description="Add a landmark or helpful directions."
                >
                  <Textarea id="notes" placeholder="Near the blue gate…" />
                </Field>
                <fieldset className="field">
                  <legend className="label">Payment method</legend>
                  <ChoiceCard
                    defaultChecked
                    label="Cash"
                    name="payment"
                    type="radio"
                  />
                  <ChoiceCard
                    description="Send proof in the order chat."
                    label="Online payment"
                    name="payment"
                    type="radio"
                  />
                </fieldset>
              </div>
            </Card>
          </section>

          <section>
            <SectionHeading title="Statuses and money" />
            <Card className="showcase__row">
              <Badge variant="available">Available</Badge>
              <Badge variant="sold-out">SOLD OUT</Badge>
              <Badge variant="verified">Verified</Badge>
              <Badge variant="unverified">Not verified</Badge>
              <Badge variant="cancelled">Cancelled</Badge>
              <Badge variant="free">{formatDeliveryCharge(0)}</Badge>
              <Badge variant="cash">Cash</Badge>
              <Badge variant="online">Online payment</Badge>
              <strong className="price">{formatPeso(8000)}</strong>
            </Card>
          </section>

          <section>
            <SectionHeading title="Surfaces and feedback" />
            <div className="showcase__columns">
              <GlassSurface>
                <h3>Glass surface</h3>
                <p>For primary sections over the branded background.</p>
              </GlassSurface>
              <GlassSurface variant="subtle">
                <h3>Subtle glass</h3>
                <p>For quieter supporting content.</p>
              </GlassSurface>
              <GlassSurface variant="strong">
                <h3>Strong glass</h3>
                <p>For overlays requiring separation.</p>
              </GlassSurface>
            </div>
            <div className="showcase__columns">
              <EmptyState
                title="No orders today"
                description="New orders will appear here."
              />
              <ErrorState description="We couldn’t load this section. Your data is safe." />
              <div className="state">
                <LoadingState label="Loading menu…" />
                <Skeleton className="skeleton--line" />
                <Skeleton className="skeleton--line-short" />
              </div>
            </div>
          </section>

          <section>
            <SectionHeading
              title="Mobile overlay"
              description="The same dialog becomes a roomy bottom sheet on narrow screens."
            />
            <Button onClick={() => setDialogOpen(true)} variant="secondary">
              Open dialog
            </Button>
          </section>
        </PageContainer>
      </main>
      <MobileStickyAction>
        <div className="sticky-demo">
          <span>
            <small>Order total</small>
            <strong>{formatPeso(25500)}</strong>
          </span>
          <Button size="large">Proceed</Button>
        </div>
      </MobileStickyAction>
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Confirm changes"
        description="Review the details before saving."
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Save changes</Button>
          </>
        }
      >
        <p>
          Dialog content remains readable, keyboard accessible, and comfortable
          at larger text sizes.
        </p>
      </Dialog>
    </AppBackground>
  )
}
