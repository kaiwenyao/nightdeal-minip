Component({
  properties: {
    variant: {
      type: String,
      value: 'primary',
    },
    size: {
      type: String,
      value: 'normal',
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    loading: {
      type: Boolean,
      value: false,
    },
    block: {
      type: Boolean,
      value: true,
    },
  },
  methods: {
    handleTap() {
      if (this.data.disabled || this.data.loading) {
        return
      }
      this.triggerEvent('tap')
    },
  },
})
