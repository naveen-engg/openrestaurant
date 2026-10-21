export const paymentProviderAdapters = {
  stripe: () => import("./stripe"),
  paypal: () => import("./paypal"),
  manual: () => import("./manual"),
  terminal: () => import("./terminal"),
};
