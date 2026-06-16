import { useState } from 'react'
import './AddToMetaMask.css'

/* One-click "Add Stable to MetaMask" button.

   USDT0 is Stable's native gas token, so a single EIP-3085
   `wallet_addEthereumChain` call is all that's needed — once the network is
   added, MetaMask shows the native USDT0 balance automatically (no
   `wallet_watchAsset` for a separate ERC-20 is required).

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

function AddButton({ network }: { network: NetworkKey }) {
  const [status, setStatus] = useState<Status>('idle')
  const params = NETWORKS[network]

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
    <span className="a2mm__item">
      <button
        type="button"
        className="a2mm__btn"
        onClick={add}
        disabled={status === 'pending'}
        aria-label={`Add Stable ${params.label} to MetaMask`}
      >
        Add Stable {params.label}
      </button>
      {status !== 'idle' && (
        <span className={`a2mm__status a2mm__status--${status}`} role="status">
          {statusText(status)}
        </span>
      )}
    </span>
  )
}

export function AddToMetaMask() {
  return (
    <div className="a2mm">
      <AddButton network="mainnet" />
      <AddButton network="testnet" />
    </div>
  )
}
