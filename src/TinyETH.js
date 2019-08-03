import ProviderEngine from 'web3-provider-engine';
import RpcSubprovider from 'web3-provider-engine/subproviders/rpc';
import WebsocketSubprovider from 'web3-provider-engine/subproviders/websocket';
import HookedWalletSubprovider from 'web3-provider-engine/subproviders/hooked-wallet';

import Plugin from './Plugin';
import Network from './Network';
import { Blockchains } from './Blockchains';
import * as PluginTypes from './PluginTypes';
import BrigeAPI from './BrigeAPI';

let ethNetwork;
let idGetter;

class TinyEthereumWallet {
  constructor() {
    this.getAccounts = this.getAccounts.bind(this);
    this.signTransaction = this.signTransaction.bind(this);
  }

  async getAccounts(callback) {
    const result = await BrigeAPI.sendAsync({
      type: 'identityFromPermissions',
      payload: {}
    });

    const accounts = !idGetter()
      ? []
      : idGetter()
          .accounts.filter((account) => account.blockchain === Blockchains.ETH)
          .map((account) => account.address);

    callback(null, accounts);
    return accounts;
  }

  async signTransaction(transaction) {
    if (!ethNetwork) throw Error.noNetwork();

    // Basic settings
    if (transaction.gas !== undefined) transaction.gasLimit = transaction.gas;
    transaction.value = transaction.value || '0x00';
    if (transaction.hasOwnProperty('data')) transaction.data = `0x${transaction.data}`;

    // Required Fields
    const requiredFields = transaction.hasOwnProperty('requiredFields')
      ? transaction.requiredFields
      : {};

    // Contract ABI
    const abi = transaction.hasOwnProperty('abi') ? transaction.abi : null;
    if (!abi && transaction.hasOwnProperty('data'))
      throw Error.signatureError(
        'no_abi',
        'You must provide a JSON ABI along with your transaction so that users can read the contract'
      );

    const payload = Object.assign(transaction, {
      blockchain: Blockchains.ETH,
      network: ethNetwork,
      requiredFields
    });
    const { signatures, returnedFields } = await BrigeAPI.sendAsync({
      type: 'requestSignature',
      payload
    });

    if (transaction.hasOwnProperty('fieldsCallback'))
      transaction.fieldsCallback(returnedFields);

    return signatures[0];
  }
}

export default class TinyETH extends Plugin {
  constructor() {
    super(Blockchains.ETH, PluginTypes.BLOCKCHAIN_SUPPORT);
  }

  hookProvider(network, requiredFields = {}) {
    throw new Error('Ethereum hook prp');
  }

  signatureProvider(...args) {
    idGetter = args[1];

    return (_network, _web3) => {
      ethNetwork = Network.fromJson(_network);

      const rpcUrl = `${ethNetwork.fullhost()}`;

      const engine = new ProviderEngine();
      const web3 = new _web3(engine);

      const walletSubprovider = new HookedWalletSubprovider(new TinyEthereumWallet());
      engine.addProvider(walletSubprovider);

      if (ethNetwork.protocol.indexOf('http') > -1)
        engine.addProvider(new RpcSubprovider({ rpcUrl }));
      else engine.addProvider(new WebsocketSubprovider({ rpcUrl }));

      engine.start();

      return web3;
    };
  }
}
