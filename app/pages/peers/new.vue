<script setup lang="ts">
import type { CreatePeerResp } from '~/types/api'

definePageMeta({ middleware: 'auth', title: 'nav.newPeering' })

const { t } = useI18n()
const api = useApi()
const auth = useAuth()
const toast = useToast()
const { meta: statusMeta } = usePeerStatus()

const { data } = await useAsyncData('new-peer-bootstrap', async () => {
  const [nodes, gate] = await Promise.all([
    api.nodes.listPublic(),
    api.peers.creationStatus().catch(() => ({ enabled: true })),
  ])
  return { nodes, gate }
}, { lazy: true, server: false })

const nodes = computed(() => data.value?.nodes ?? [])
const creationEnabled = computed(() => data.value?.gate?.enabled !== false)

const step = ref(0)
const form = reactive({ node_id: '', pubkey: '', endpoint: '', lla: '', mtu: '', psk: false })
const submitting = ref(false)
const tfBg = 'var(--md-sys-color-surface-container-low)'

const steps = [t('peerNew.steps.selectNode'), t('peerNew.steps.configure'), t('peerNew.steps.review'), t('peerNew.steps.done')]
const node = computed(() => nodes.value.find((n) => n.id === form.node_id) || null)
const nodeSelectable = computed(() => !!node.value && node.value.online)

// If the selected node disappears or goes offline on a data refetch, drop it so
// the wizard can never advance/submit with a stale offline selection. After
// creation the selection must survive so the done step keeps its config.
watch(nodes, () => {
  if (created.value) return
  if (form.node_id && !nodeSelectable.value) form.node_id = ''
})

const pubkeyError = computed(() => form.pubkey && !isValidPubkey(form.pubkey) ? t('peerNew.validation.pubkey') : '')
const endpointError = computed(() => form.endpoint && !isValidEndpoint(form.endpoint) ? t('peerNew.validation.endpoint') : '')
const llaError = computed(() => form.lla && !isValidLLA(form.lla) ? t('peerNew.validation.lla') : '')
const mtuError = computed(() => !isValidMtu(form.mtu) ? t('peerNew.validation.mtu') : '')
const canConfig = computed(() =>
  isValidPubkey(form.pubkey) && isValidEndpoint(form.endpoint) && isValidLLA(form.lla) && isValidMtu(form.mtu),
)

// Derived WireGuard port, mirroring the backend: wg_port_prefix*10000 + asn%10000.
const computedPort = computed(() => {
  const n = node.value
  const asn = auth.asn.value
  if (!n || asn == null) return ''
  const prefix = n.wg_port_prefix || 5
  return String(prefix * 10000 + (asn % 10000))
})

// Creation result; once set, the wizard moves to the final "done" step which
// shows the complete ready-to-paste config (incl. the generated PSK).
const created = ref<CreatePeerResp | null>(null)

// Our-side parameters the user needs to configure their router ([label, value]).
const ourRows = computed(() => {
  const n = node.value
  if (!n) return []
  const endpoint = computedPort.value ? `${n.public_ip}:${computedPort.value}` : n.public_ip
  return [
    [t('peerNew.our.asn'), `AS${n.our_asn}`],
    [t('peerNew.our.endpoint'), endpoint],
    [t('peerNew.our.pubkey'), n.our_wg_pubkey],
    [t('peerNew.our.lla'), n.our_lla],
  ] as [string, string][]
})

// Ready-to-paste WireGuard config (local side). Before creation the PSK is a
// placeholder; the done step re-renders it with the generated key.
function buildWgConfig(psk: string | null): string {
  const n = node.value
  if (!n) return ''
  const asn = auth.asn.value
  const lines = [
    `# AutoPeer ASN: ${asn ?? ''}`,
    '[Interface]',
    `PrivateKey = <${t('peerNew.yourPrivateKey')}>`,
    `Address = ${form.lla || 'fe80::1'}/64`,
  ]
  if (form.mtu) lines.push(`MTU = ${form.mtu}`)
  lines.push('Table = off', '', '[Peer]', `PublicKey = ${n.our_wg_pubkey}`)
  if (form.psk) lines.push(`PresharedKey = ${psk ?? `<${t('peerNew.pskAfterCreate')}>`}`)
  lines.push(
    'AllowedIPs = 172.20.0.0/14, fd00::/8, fe80::/10',
    `Endpoint = ${n.public_ip}:${computedPort.value}`,
    'PersistentKeepalive = 25',
  )
  return lines.join('\n')
}
const wgConfigPreview = computed(() => buildWgConfig(null))
const finalWgConfig = computed(() => buildWgConfig(created.value?.wg_preshared_key ?? null))

// Ready-to-paste BIRD BGP protocol block.
const birdConfigPreview = computed(() => {
  const n = node.value
  if (!n) return ''
  const asn = auth.asn.value ?? ''
  return [
    `protocol bgp dn42_${asn} from dnpeers {`,
    `    neighbor ${n.our_lla} % 'dn42${asn}' as ${asn};`,
    '}',
  ].join('\n')
})

async function submit() {
  // Defensive re-validation at the submit boundary: never POST an invalid form
  // even if step state was reached out of band (mirrors closed handleSubmit).
  if (!nodeSelectable.value || !canConfig.value) {
    step.value = nodeSelectable.value ? 1 : 0
    toast.error(t('peerNew.fixValidation'))
    return
  }
  submitting.value = true
  try {
    created.value = await api.peers.create({
      node_id: form.node_id,
      remote_pubkey: form.pubkey.trim(),
      remote_endpoint: form.endpoint.trim(),
      remote_lla: form.lla.trim(),
      mtu: form.mtu ? Number(form.mtu) : null,
      enable_psk: form.psk,
    })
    step.value = 3
    toast.show(t('peerNew.createdTitle'))
  } catch (e) {
    toast.error(e)
  } finally {
    submitting.value = false
  }
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
          <div v-if="!nodes.length" class="md-body-medium txt-variant">{{ t('peerNew.noNodes') }}</div>
          <div v-else class="col gap-3">
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
            <MdButton variant="filled" trailing-icon="arrow_forward" :disabled="!nodeSelectable" @click="step = 1">{{ t('common.next') }}</MdButton>
          </div>
        </div>

        <!-- Step 1: configure -->
        <div v-else-if="step === 1">
          <h3 class="md-title-large" :style="{ margin: '0 0 20px' }">{{ t('peerNew.configTitle') }}</h3>

          <!-- Our-side parameters: what the user needs to configure their router -->
          <div :style="{ marginBottom: '22px', borderRadius: '16px', background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)', padding: '16px 18px' }">
            <div class="md-title-small row gap-2" :style="{ alignItems: 'center' }">
              <MdSym name="dns" :size="18" fill /> {{ t('peerNew.ourInfoTitle') }}
            </div>
            <div class="md-body-small" :style="{ marginTop: '2px', opacity: 0.85 }">{{ t('peerNew.ourInfoBody') }}</div>
            <div class="col" :style="{ marginTop: '10px' }">
              <div v-for="row in ourRows" :key="row[0]" class="row gap-3" :style="{ padding: '7px 0', alignItems: 'center' }">
                <div class="md-label-large" :style="{ width: '130px', flexShrink: 0, opacity: 0.85 }">{{ row[0] }}</div>
                <div class="md-body-medium mono" :style="{ flex: 1, wordBreak: 'break-all' }">{{ row[1] }}</div>
                <MdCopyButton :value="row[1]" :size="28" />
              </div>
            </div>
          </div>

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
        <div v-else-if="step === 2">
          <h3 class="md-title-large" :style="{ margin: '0 0 16px' }">{{ t('peerNew.reviewTitle') }}</h3>

          <div class="md-label-large txt-variant" :style="{ margin: '0 0 8px' }">{{ t('peerNew.reviewYours') }}</div>
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

          <div class="md-label-large txt-variant" :style="{ margin: '16px 0 8px' }">{{ t('peerNew.reviewOurs') }}</div>
          <div :style="{ borderRadius: '16px', border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }">
            <div
              v-for="(row, i) in ourRows"
              :key="row[0]"
              class="row gap-4"
              :style="{ padding: '14px 18px', borderBottom: i < ourRows.length - 1 ? '1px solid var(--md-sys-color-outline-variant)' : 'none', alignItems: 'center' }"
            >
              <div class="md-body-medium txt-variant" :style="{ width: '140px', flexShrink: 0 }">{{ row[0] }}</div>
              <div class="md-body-medium mono" :style="{ flex: 1, wordBreak: 'break-all' }">{{ row[1] }}</div>
              <MdCopyButton :value="row[1]" :size="28" />
            </div>
          </div>

          <!-- Generated config preview (ready to paste on the peer's side) -->
          <div :style="{ marginTop: '20px', borderRadius: '16px', border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }">
            <div class="row space-between" :style="{ padding: '14px 18px', background: 'var(--md-sys-color-surface-container-low)' }">
              <div class="md-title-small row gap-2" :style="{ alignItems: 'center' }">
                <MdSym name="terminal" :size="18" /> {{ t('peerNew.configPreview') }}
              </div>
            </div>
            <div class="col gap-4" :style="{ padding: '18px' }">
              <div class="col gap-2">
                <div class="row space-between" :style="{ alignItems: 'center' }">
                  <div class="md-label-large txt-variant">{{ t('peerNew.wgConfig') }}</div>
                  <MdCopyButton :value="wgConfigPreview" :size="30" />
                </div>
                <pre class="code-block" :style="{ margin: 0 }">{{ wgConfigPreview }}</pre>
              </div>
              <div class="col gap-2">
                <div class="row space-between" :style="{ alignItems: 'center' }">
                  <div class="md-label-large txt-variant">{{ t('peerNew.birdConfig') }}</div>
                  <MdCopyButton :value="birdConfigPreview" :size="30" />
                </div>
                <pre class="code-block" :style="{ margin: 0 }">{{ birdConfigPreview }}</pre>
              </div>
              <div class="md-body-small txt-variant">{{ t('peerNew.configNote') }}</div>
            </div>
          </div>

          <div class="md-body-small row gap-2" :style="{ alignItems: 'flex-start', marginTop: '16px', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }">
            <MdSym name="info" :size="18" fill /> <span>{{ t('peerNew.reviewNote') }}</span>
          </div>
          <div class="row space-between" :style="{ marginTop: '24px' }">
            <MdButton variant="text" icon="arrow_back" :disabled="submitting" @click="step = 1">{{ t('common.back') }}</MdButton>
            <MdButton variant="filled" icon="rocket_launch" :loading="submitting" @click="submit">{{ t('peerNew.createPeer') }}</MdButton>
          </div>
        </div>

        <!-- Step 3: done — final ready-to-paste config (incl. generated PSK) -->
        <div v-else-if="created">
          <div class="col gap-3 text-center" :style="{ alignItems: 'center', padding: '8px 0 20px' }">
            <span :style="{ display: 'inline-flex', width: '56px', height: '56px', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-tertiary-container)', color: 'var(--md-sys-color-on-tertiary-container)' }">
              <MdSym name="check" :size="30" />
            </span>
            <h3 class="md-title-large" :style="{ margin: 0 }">{{ t('peerNew.doneTitle') }}</h3>
            <MdStatus :kind="statusMeta(created.status).kind">{{ statusMeta(created.status).label }}</MdStatus>
            <p class="md-body-medium txt-variant" :style="{ margin: 0, maxWidth: '480px' }">
              {{ created.status === 'active' ? t('peerNew.doneBodyActive') : t('peerNew.doneBodyPending') }}
            </p>
          </div>

          <div :style="{ borderRadius: '16px', border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }">
            <div class="row space-between" :style="{ padding: '14px 18px', background: 'var(--md-sys-color-surface-container-low)' }">
              <div class="md-title-small row gap-2" :style="{ alignItems: 'center' }">
                <MdSym name="terminal" :size="18" /> {{ t('peerNew.finalConfigTitle') }}
              </div>
            </div>
            <div class="col gap-4" :style="{ padding: '18px' }">
              <div class="col gap-2">
                <div class="row space-between" :style="{ alignItems: 'center' }">
                  <div class="md-label-large txt-variant">{{ t('peerNew.wgConfig') }}</div>
                  <MdCopyButton :value="finalWgConfig" :size="30" />
                </div>
                <pre class="code-block" :style="{ margin: 0 }">{{ finalWgConfig }}</pre>
              </div>
              <div class="col gap-2">
                <div class="row space-between" :style="{ alignItems: 'center' }">
                  <div class="md-label-large txt-variant">{{ t('peerNew.birdConfig') }}</div>
                  <MdCopyButton :value="birdConfigPreview" :size="30" />
                </div>
                <pre class="code-block" :style="{ margin: 0 }">{{ birdConfigPreview }}</pre>
              </div>
              <div class="md-body-small txt-variant">{{ t('peerNew.finalConfigNote') }}</div>
            </div>
          </div>

          <div
            v-if="created.wg_preshared_key"
            class="md-body-small row gap-2"
            :style="{ alignItems: 'flex-start', marginTop: '16px', padding: '14px', borderRadius: '12px', background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }"
          >
            <MdSym name="key" :size="18" fill /> <span>{{ t('peerNew.pskIncluded') }}</span>
          </div>

          <div class="row space-between" :style="{ marginTop: '24px' }">
            <MdButton variant="text" icon="list" @click="navigateTo('/peers')">{{ t('peerNew.backToList') }}</MdButton>
            <MdButton variant="filled" trailing-icon="arrow_forward" @click="navigateTo(`/peers/${created.id}`)">{{ t('peerNew.viewPeer') }}</MdButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
