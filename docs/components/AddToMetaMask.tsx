import { useState } from 'react'

/* One-click "Add Stable to MetaMask" button.

   USDT0 is Stable's native gas token, so a single EIP-3085
   `wallet_addEthereumChain` call is all that's needed — once the network is
   added, MetaMask shows the native USDT0 balance automatically (no
   `wallet_watchAsset` for a separate ERC-20 is required).

   Styling is inline (not a separate .css import) on purpose: Vocs's production
   build does not reliably extract CSS imported from a component used only
   inside MDX, so an imported stylesheet renders in `vocs dev` but vanishes on
   the static deploy. Inline styles ship with the hydrated component in every
   environment. Values reference Vocs theme variables so the button still tracks
   the light/dark toggle.

   Network params mirror reference/connect.mdx — keep them in sync. */

type NetworkKey = 'mainnet' | 'testnet'

type ChainParams = {
  label: string
  chainId: string // hex, per EIP-3085
  chainName: string
  rpcUrls: string[]
  blockExplorerUrls: string[]
  nativeCurrency: { name: string; symbol: string; decimals: number }
}

const NETWORKS: Record<NetworkKey, ChainParams> = {
  mainnet: {
    label: 'Mainnet',
    chainId: '0x3dc', // 988
    chainName: 'Stable Mainnet',
    rpcUrls: ['https://rpc.stable.xyz'],
    blockExplorerUrls: ['https://stablescan.xyz'],
    nativeCurrency: { name: 'USDT0', symbol: 'USDT0', decimals: 18 },
  },
  testnet: {
    label: 'Testnet',
    chainId: '0x899', // 2201
    chainName: 'Stable Testnet',
    rpcUrls: ['https://rpc.testnet.stable.xyz'],
    blockExplorerUrls: ['https://testnet.stablescan.xyz'],
    nativeCurrency: { name: 'USDT0', symbol: 'USDT0', decimals: 18 },
  },
}

type Status = 'idle' | 'pending' | 'success' | 'error' | 'no-wallet'

function statusText(status: Status): string {
  switch (status) {
    case 'pending':
      return 'Confirm in MetaMask…'
    case 'success':
      return 'Added — check MetaMask'
    case 'no-wallet':
      return 'No wallet detected'
    case 'error':
      return 'Request rejected'
    default:
      return ''
  }
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
  margin: '1rem 0',
}

const itemStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '0.4rem',
}

function buttonStyle(hover: boolean, disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.55rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    lineHeight: 1,
    color: 'var(--vocs-color_backgroundAccentText)',
    background: hover
      ? 'var(--vocs-color_backgroundAccentHover)'
      : 'var(--vocs-color_backgroundAccent)',
    border: '1px solid var(--vocs-color_backgroundAccent)',
    borderRadius: 'var(--vocs-borderRadius_8)',
    cursor: disabled ? 'progress' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'background-color 0.15s ease',
  }
}

function statusStyle(status: Status): React.CSSProperties {
  const color =
    status === 'success'
      ? 'var(--vocs-color_successText)'
      : status === 'error' || status === 'no-wallet'
        ? 'var(--vocs-color_dangerText)'
        : 'var(--vocs-color_text3)'
  return { fontSize: '0.8125rem', color }
}

function AddButton({ network }: { network: NetworkKey }) {
  const [status, setStatus] = useState<Status>('idle')
  const [hover, setHover] = useState(false)
  const params = NETWORKS[network]
  const disabled = status === 'pending'

  async function add() {
    // `ethereum` is injected by MetaMask (and most EVM wallets) on the client.
    const ethereum = (globalThis as { ethereum?: { request: (a: unknown) => Promise<unknown> } }).ethereum
    if (!ethereum) {
      setStatus('no-wallet')
      return
    }
    setStatus('pending')
    try {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: params.chainId,
            chainName: params.chainName,
            rpcUrls: params.rpcUrls,
            blockExplorerUrls: params.blockExplorerUrls,
            nativeCurrency: params.nativeCurrency,
          },
        ],
      })
      setStatus('success')
    } catch {
      // User rejected, or the wallet refused — surface a neutral message.
      setStatus('error')
    }
  }

  return (
    <span style={itemStyle}>
      <button
        type="button"
        style={buttonStyle(hover && !disabled, disabled)}
        onClick={add}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        disabled={disabled}
        aria-label={`Add Stable ${params.label} to MetaMask`}
      >
        Add Stable {params.label}
      </button>
      {status !== 'idle' && (
        <span style={statusStyle(status)} role="status">
          {statusText(status)}
        </span>
      )}
    </span>
  )
}

export function AddToMetaMask() {
  return (
    <div style={wrapStyle}>
      <AddButton network="mainnet" />
      <AddButton network="testnet" />
    </div>
  )
}
