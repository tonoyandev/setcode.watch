import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GAddress from '~/components/GAddress.vue';

const ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('GAddress', () => {
  it('truncates by default and keeps the full address in title', () => {
    const wrapper = mount(GAddress, { props: { address: ADDR } });
    expect(wrapper.text()).toBe('0xaaaa…aaaa');
    expect(wrapper.attributes('title')).toBe(ADDR);
  });

  it('renders the full address when truncate=false', () => {
    const wrapper = mount(GAddress, { props: { address: ADDR, truncate: false } });
    expect(wrapper.text()).toBe(ADDR);
  });

  it('respects custom leading/trailing lengths', () => {
    const wrapper = mount(GAddress, {
      props: { address: ADDR, leading: 10, trailing: 6 },
    });
    expect(wrapper.text()).toBe('0xaaaaaaaa…aaaaaa');
  });

  it('renders short strings unchanged even with truncation on', () => {
    const wrapper = mount(GAddress, { props: { address: '0xshort' } });
    expect(wrapper.text()).toBe('0xshort');
  });
});
