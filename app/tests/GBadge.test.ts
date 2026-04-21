import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GBadge from '~/components/GBadge.vue';

describe('GBadge', () => {
  it('renders the verified variant with ShieldCheck and correct label', () => {
    const wrapper = mount(GBadge, { props: { classification: 'verified' } });
    expect(wrapper.classes()).toContain('g-badge--verified');
    expect(wrapper.text()).toBe('Verified');
    // lucide-vue-next renders an <svg>
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('renders the unknown variant with CircleHelp', () => {
    const wrapper = mount(GBadge, { props: { classification: 'unknown' } });
    expect(wrapper.classes()).toContain('g-badge--unknown');
    expect(wrapper.text()).toBe('Unknown');
  });

  it('renders the malicious variant with ShieldAlert', () => {
    const wrapper = mount(GBadge, { props: { classification: 'malicious' } });
    expect(wrapper.classes()).toContain('g-badge--malicious');
    expect(wrapper.text()).toBe('Malicious');
  });

  it('hides the text label when showLabel is false but exposes aria-label', () => {
    const wrapper = mount(GBadge, {
      props: { classification: 'verified', showLabel: false },
    });
    expect(wrapper.find('.g-badge__label').exists()).toBe(false);
    expect(wrapper.attributes('aria-label')).toBe('Verified');
  });

  it('applies the size class', () => {
    const wrapper = mount(GBadge, {
      props: { classification: 'verified', size: 'hero' },
    });
    expect(wrapper.classes()).toContain('g-badge--hero');
  });
});
