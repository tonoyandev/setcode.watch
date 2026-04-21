import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GInput from '~/components/GInput.vue';

describe('GInput', () => {
  it('renders a label and binds it to the input via for/id', () => {
    const wrapper = mount(GInput, { props: { modelValue: '', label: 'Address' } });
    const label = wrapper.find('label');
    const input = wrapper.find('input');
    expect(label.text()).toBe('Address');
    expect(label.attributes('for')).toBe(input.attributes('id'));
  });

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(GInput, { props: { modelValue: '' } });
    await wrapper.find('input').setValue('0xabc');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['0xabc']);
  });

  it('marks the field aria-invalid and renders an error message', () => {
    const wrapper = mount(GInput, {
      props: { modelValue: 'bad', error: 'Not a valid address' },
    });
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
    const error = wrapper.find('[role="alert"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toBe('Not a valid address');
  });

  it('renders help text when no error is present', () => {
    const wrapper = mount(GInput, {
      props: { modelValue: '', help: 'Paste any EOA' },
    });
    expect(wrapper.text()).toContain('Paste any EOA');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('applies the monospace class when requested', () => {
    const wrapper = mount(GInput, {
      props: { modelValue: '0xabc', monospace: true },
    });
    expect(wrapper.find('input').classes()).toContain('g-input__field--mono');
  });
});
