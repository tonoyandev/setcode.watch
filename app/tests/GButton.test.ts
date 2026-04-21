import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GButton from '~/components/GButton.vue';

describe('GButton', () => {
  it('renders slot content and defaults to a primary button', () => {
    const wrapper = mount(GButton, { slots: { default: 'Click me' } });
    expect(wrapper.text()).toContain('Click me');
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.classes()).toContain('g-button--primary');
    expect(wrapper.classes()).toContain('g-button--md');
  });

  it('applies secondary variant and lg size when requested', () => {
    const wrapper = mount(GButton, {
      props: { variant: 'secondary', size: 'lg' },
      slots: { default: 'x' },
    });
    expect(wrapper.classes()).toContain('g-button--secondary');
    expect(wrapper.classes()).toContain('g-button--lg');
  });

  it('renders as an anchor when as="a" and exposes href', () => {
    const wrapper = mount(GButton, {
      props: { as: 'a', href: 'https://example.com' },
      slots: { default: 'link' },
    });
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBe('https://example.com');
  });

  it('marks the button aria-busy and disabled when loading', () => {
    const wrapper = mount(GButton, {
      props: { loading: true },
      slots: { default: 'x' },
    });
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.find('.g-button__spinner').exists()).toBe(true);
  });

  it('disables the button when disabled prop is set', () => {
    const wrapper = mount(GButton, {
      props: { disabled: true },
      slots: { default: 'x' },
    });
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true);
  });
});
