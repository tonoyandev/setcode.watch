<script setup lang="ts">
import { t } from '~/i18n';

useHead({
  title: 'SetCode.watch — monitoring for EIP-7702 delegations',
});
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero__inner">
        <p class="hero__eyebrow">EIP-7702 · Ethereum mainnet</p>
        <h1 class="hero__headline">{{ t('landing.hero.headline') }}</h1>
        <p class="hero__subhead">{{ t('landing.hero.subhead') }}</p>
        <div class="hero__actions">
          <NuxtLink to="/check" class="hero__primaryCta">
            <GButton variant="primary" size="lg" as="button">
              {{ t('landing.hero.primaryCta') }}
            </GButton>
          </NuxtLink>
          <NuxtLink to="/subscribe" class="hero__secondaryCta">
            <GButton variant="secondary" size="lg" as="button">
              {{ t('landing.hero.secondaryCta') }}
            </GButton>
          </NuxtLink>
        </div>
        <div class="hero__badges" aria-label="Classification legend">
          <GBadge classification="verified" size="inline" />
          <GBadge classification="unknown" size="inline" />
          <GBadge classification="malicious" size="inline" />
        </div>
      </div>
    </section>

    <section class="how">
      <div class="how__inner">
        <h2 class="how__title">{{ t('landing.how.title') }}</h2>
        <div class="how__grid">
          <GCard class="how__card">
            <h3 class="how__stepTitle">{{ t('landing.how.step1.title') }}</h3>
            <p class="how__stepBody">{{ t('landing.how.step1.body') }}</p>
          </GCard>
          <GCard class="how__card">
            <h3 class="how__stepTitle">{{ t('landing.how.step2.title') }}</h3>
            <p class="how__stepBody">{{ t('landing.how.step2.body') }}</p>
          </GCard>
          <GCard class="how__card">
            <h3 class="how__stepTitle">{{ t('landing.how.step3.title') }}</h3>
            <p class="how__stepBody">{{ t('landing.how.step3.body') }}</p>
          </GCard>
        </div>
      </div>
    </section>

    <section class="why">
      <div class="why__inner">
        <h2 class="why__title">{{ t('landing.why.title') }}</h2>
        <p class="why__body">{{ t('landing.why.body') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  width: 100%;
}

/* Hero -------------------------------------------------------------- */

.hero {
  padding: var(--space-20) var(--space-6) var(--space-16);
  background:
    radial-gradient(ellipse at top, rgba(168, 90, 28, 0.06), transparent 60%),
    var(--color-bg-page);
}

.hero__inner {
  max-width: var(--width-page);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-5);
}

.hero__eyebrow {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-ink-muted);
  letter-spacing: 0.02em;
  margin: 0;
}

.hero__headline {
  font-size: clamp(var(--text-3xl), 5vw, var(--text-4xl));
  max-width: 22ch;
}

.hero__subhead {
  font-size: var(--text-lg);
  color: var(--color-ink-muted);
  max-width: 60ch;
  margin: 0;
}

.hero__actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
  flex-wrap: wrap;
}

.hero__primaryCta,
.hero__secondaryCta {
  text-decoration: none;
}

.hero__badges {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-6);
  flex-wrap: wrap;
}

/* How --------------------------------------------------------------- */

.how {
  padding: var(--space-12) var(--space-6);
}

.how__inner {
  max-width: var(--width-page);
  margin: 0 auto;
}

.how__title {
  margin-bottom: var(--space-8);
}

.how__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-5);
}

.how__stepTitle {
  margin-bottom: var(--space-3);
  color: var(--color-ink-strong);
}

.how__stepBody {
  color: var(--color-ink-muted);
  margin: 0;
  font-size: var(--text-base);
}

/* Why --------------------------------------------------------------- */

.why {
  padding: var(--space-12) var(--space-6) var(--space-16);
  background: var(--color-bg-subtle);
  border-top: var(--border-width) solid var(--color-border);
  border-bottom: var(--border-width) solid var(--color-border);
}

.why__inner {
  max-width: var(--width-page);
  margin: 0 auto;
}

.why__title {
  margin-bottom: var(--space-4);
}

.why__body {
  font-size: var(--text-lg);
  color: var(--color-ink);
  max-width: 72ch;
  margin: 0;
}
</style>
