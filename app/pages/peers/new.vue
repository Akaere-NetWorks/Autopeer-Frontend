<script setup lang="ts">
definePageMeta({ middleware: 'auth', title: 'nav.newPeering' })

const { t } = useI18n()
const api = useApi()
const toast = useToast()

const { data } = await useAsyncData('new-peer-bootstrap', async () => {
  const [nodes, gate] = await Promise.all([
    api.nodes.listPublic(),
    api.peers.creationStatus().catch(() => ({ enabled: true })),
  ])
  return { nodes, gate }
}, { server: false })

const nodes = computed(() => data.value?.nodes ?? [])
const creationEnabled = computed(() => data.value?.gate?.enabled !== false)

const step = ref(0)
const form = reactive({ node_id: '', pubkey: '', endpoint: '', lla: '', mtu: '', psk: false })
const submitting = ref(false)
const tfBg = 'var(--md-sys-color-surface-container-low)'

const steps = [t('peerNew.steps.selectNode'), t('peerNew.steps.configure'), t('peerNew.steps.review')]
const node = computed(() => nodes.value.find((n) => n.id === form.node_id) || null)

const pubkeyError = computed(() => form.pubkey && !isValidPubkey(form.pubkey) ? t('peerNew.validation.pubkey') : '')
const endpointError = computed(() => form.endpoint && !isValidEndpoint(form.endpoint) ? t('peerNew.validation.endpoint') : '')
const llaError = computed(() => form.lla && !isValidLLA(form.lla) ? t('peerNew.validation.lla') : '')
const mtuError = computed(() => !isValidMtu(form.mtu) ? t('peerNew.validation.mtu') : '')
const canConfig = computed(() =>
  isValidPubkey(form.pubkey) && isValidEndpoint(form.endpoint) && isValidLLA(form.lla) && isValidMtu(form.mtu),
)

// Success / PSK reveal
const createdPsk = ref<string | null>(null)
const createdId = ref<string | null>(null)
const showCreated = ref(false)

async function submit() {
  submitting.value = true
  try {
    const res = await api.peers.create({
      node_id: form.node_id,
      remote_pubkey: form.pubkey.trim(),
      remote_endpoint: form.endpoint.trim(),
      remote_lla: form.lla.trim(),
      mtu: form.mtu ? Number(form.mtu) : null,
      enable_psk: form.psk,
    })
    createdId.value = res.id
    if (res.wg_preshared_key) {
      createdPsk.value = res.wg_preshared_key
      showCreated.value = true
    } else {
      toast.show(t('peerNew.createdTitle'))
      await navigateTo(`/peers/${res.id}`)
    }
  } catch (e) {
    toast.error(e)
  } finally {
    submitting.value = false
  }
}

async function copyPsk() {
  if (createdPsk.value && import.meta.client && navigator.clipboard) {
    await navigator.clipboard.writeText(createdPsk.value)
    toast.show(t('common.copied'))
  }
}

async function finishCreated() {
  showCreated.value = false
  await navigateTo(createdId.value ? `/peers/${createdId.value}` : '/peers')
}

const reviewRows = computed(() => [
  [t('peerNew.fields.node'), node.value ? `${node.value.name} (${node.value.location})` : t('common.dash'), false],
  [t('peerNew.fields.pubkey'), form.pubkey || t('common.dash'), true],
  [t('peerNew.fields.endpoint'), form.endpoint || t('common.dash'), true],
  [t('peerNew.fields.lla'), form.lla || t('common.dash'), true],
  [t('peerNew.fields.mtu'), form.mtu || t('peerNew.mtuDefault'), false],
  [t('peerNew.fields.psk'), form.psk ? t('peerNew.pskEnabled') : t('peerNew.pskDisabled'), false],
] as [string, string, boolean][])
</script>

<template>
  <div class="col gap-5" :style="{ maxWidth: '760px', margin: '0 auto', width: '100%' }">
    <AppBreadcrumb :items="[{ label: t('nav.myPeers'), to: '/peers' }, { label: t('peerNew.breadcrumb') }]" />
    <h1 class="md-headline-medium" :style="{ margin: 0 }">{{ t('peerNew.title') }}</h1>

    <!-- Gate closed -->
    <div v-if="!creationEnabled" class="card card-filled card-pad row gap-4" :style="{ alignItems: 'flex-start', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }">
      <MdSym name="block" :size="24" fill />
      <div>
        <div class="md-title-medium">{{ t('peerNew.gateClosed') }}</div>
        <div class="md-body-medium" :style="{ marginTop: '4px' }">{{ t('peerNew.gateClosedBody') }}</div>
      </div>
    </div>

    <template v-else>
      <!-- Stepper -->
      <div class="row" :style="{ gap: '4px' }">
        <template v-for="(s, i) in steps" :key="s">
          <div class="row gap-3">
            <span class="step-dot" :class="i < step ? 'step-dot-done' : i === step ? 'step-dot-active' : 'step-dot-idle'">
              <MdSym v-if="i < step" name="check" :size="18" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span class="md-label-large" :style="{ color: i <= step ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-surface-variant)' }">{{ s }}</span>
          </div>
          <div v-if="i < steps.length - 1" :style="{ flex: 1, height: '2px', borderRadius: '2px', background: i < step ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)', margin: '0 8px' }" />
        </template>
      </div>

      <div class="card card-elevated card-pad">
        <!-- Step 0: node -->
        <div v-if="step === 0">
          <h3 class="md-title-large" :style="{ margin: '0 0 16px' }">{{ t('peerNew.selectNodeTitle') }}</h3>
          <div class="col gap-3">
            <label
              v-for="n in nodes"
              :key="n.id"
              v-ripple
              class="state-layer"
              :style="{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '16px',
                border: `${form.node_id === n.id ? 2 : 1}px solid ${form.node_id === n.id ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'}`,
                background: form.node_id === n.id ? 'var(--md-sys-color-primary-container)' : 'transparent',
                color: form.node_id === n.id ? 'var(--md-sys-color-on-primary-container)' : 'inherit',
                cursor: n.online ? 'pointer' : 'not-allowed', opacity: n.online ? 1 : 0.5,
                '--slc': 'var(--md-sys-color-on-surface)',
              }"
            >
              <input type="radio" name="node" :disabled="!n.online" :checked="form.node_id === n.id" :style="{ position: 'relative', zIndex: 1, accentColor: 'var(--md-sys-color-primary)', width: '20px', height: '20px' }" @change="form.node_id = n.id">
              <div :style="{ flex: 1, position: 'relative', zIndex: 1 }">
                <div class="md-title-medium">{{ n.name }} <span class="md-body-small" :style="{ opacity: 0.8, fontWeight: 400 }">· {{ n.location }}</span></div>
                <div class="md-body-small mono" :style="{ opacity: 0.85 }">{{ n.public_ip }} · AS{{ n.our_asn }}</div>
              </div>
              <MdStatus v-if="!n.online" kind="neutral">{{ t('landing.offline') }}</MdStatus>
            </label>
          </div>
          <div class="row" :style="{ justifyContent: 'flex-end', marginTop: '24px' }">
            <MdButton variant="filled" trailing-icon="arrow_forward" :disabled="!form.node_id" @click="step = 1">{{ t('common.next') }}</MdButton>
          </div>
        </div>

        <!-- Step 1: configure -->
        <div v-else-if="step === 1">
          <h3 class="md-title-large" :style="{ margin: '0 0 20px' }">{{ t('peerNew.configTitle') }}</h3>
          <div class="col" :style="{ gap: '22px' }">
            <MdTextField v-model="form.pubkey" :label="t('peerNew.pubkey')" :placeholder="t('peerNew.pubkeyPlaceholder')" mono icon="key" :tf-bg="tfBg" :error="pubkeyError" :supporting="t('peerNew.pubkeySupport')" />
            <MdTextField v-model="form.endpoint" :label="t('peerNew.endpoint')" :placeholder="t('peerNew.endpointPlaceholder')" mono icon="lan" :tf-bg="tfBg" :error="endpointError" :supporting="t('peerNew.endpointSupport')" />
            <MdTextField v-model="form.lla" :label="t('peerNew.lla')" :placeholder="t('peerNew.llaPlaceholder')" mono icon="alternate_email" :tf-bg="tfBg" :error="llaError" :supporting="t('peerNew.llaSupport')" />
            <MdTextField :model-value="form.mtu" :label="t('peerNew.mtu')" :placeholder="t('peerNew.mtuPlaceholder')" mono icon="straighten" :tf-bg="tfBg" inputmode="numeric" :error="mtuError" @update:model-value="(v: string) => (form.mtu = v.replace(/\D/g, ''))" />
            <div class="row gap-4" :style="{ padding: '4px' }">
              <MdSwitch v-model="form.psk" :aria-label="t('peerNew.pskTitle')" />
              <div>
                <div class="md-title-small">{{ t('peerNew.pskTitle') }}</div>
                <div class="md-body-small txt-variant">{{ t('peerNew.pskBody') }}</div>
              </div>
            </div>
          </div>
          <div class="row space-between" :style="{ marginTop: '24px' }">
            <MdButton variant="text" icon="arrow_back" @click="step = 0">{{ t('common.back') }}</MdButton>
            <MdButton variant="filled" trailing-icon="arrow_forward" :disabled="!canConfig" @click="step = 2">{{ t('common.next') }}</MdButton>
          </div>
        </div>

        <!-- Step 2: review -->
        <div v-else>
          <h3 class="md-title-large" :style="{ margin: '0 0 16px' }">{{ t('peerNew.reviewTitle') }}</h3>
          <div :style="{ borderRadius: '16px', border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }">
            <div
              v-for="(row, i) in reviewRows"
              :key="row[0]"
              class="row gap-4"
              :style="{ padding: '14px 18px', borderBottom: i < reviewRows.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none' }"
            >
              <div class="md-body-medium txt-variant" :style="{ width: '140px', flexShrink: 0 }">{{ row[0] }}</div>
              <div class="md-body-medium" :class="{ mono: row[2] }" :style="{ flex: 1, wordBreak: 'break-all' }">{{ row[1] }}</div>
            </div>
          </div>
          <div class="md-body-small row gap-2" :style="{ alignItems: 'flex-start', marginTop: '16px', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }">
            <MdSym name="info" :size="18" fill /> <span>{{ t('peerNew.reviewNote') }}</span>
          </div>
          <div class="row space-between" :style="{ marginTop: '24px' }">
            <MdButton variant="text" icon="arrow_back" @click="step = 1">{{ t('common.back') }}</MdButton>
            <MdButton variant="filled" icon="rocket_launch" :loading="submitting" @click="submit">{{ t('peerNew.createPeer') }}</MdButton>
          </div>
        </div>
      </div>
    </template>

    <!-- PSK reveal dialog -->
    <MdDialog v-model:open="showCreated" :title="t('peerNew.createdTitle')">
      <p>{{ t('peerNew.createdBody') }}</p>
      <div class="code-block" :style="{ marginTop: '12px', position: 'relative' }">
        {{ createdPsk }}
        <button class="icon-btn" :style="{ position: 'absolute', top: '6px', right: '6px', width: '32px', height: '32px' }" :title="t('common.copy')" @click="copyPsk">
          <MdSym name="content_copy" :size="18" />
        </button>
      </div>
      <template #actions>
        <MdButton variant="filled" icon="check" @click="finishCreated">{{ t('common.confirm') }}</MdButton>
      </template>
    </MdDialog>
  </div>
</template>
