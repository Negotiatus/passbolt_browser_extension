/**
 * Passbolt domain check setup step
 *
 * @copyright (c) 2017 Passbolt SARL
 * @licence GNU Affero General Public License http://www.gnu.org/licenses/agpl-3.0.en.html
 */
var passbolt = passbolt || {};
passbolt.setup = passbolt.setup || {};
passbolt.setup.steps = passbolt.setup.steps || {};

$(function () {

  /*
   * Step settings.
   */
  var step = {
    id: 'domain_check',
    /**
     * Elements available in the dom.
     * Setup will automatically create corresponding jquery elements
     * that will be accessible with ${name}.
     * Example : step.elts.$fingerprintWrapper
     */
    elts: {
      fingerprintWrapper: '.input.key-fingerprint',
      fingerprintError: '.input.key-fingerprint .message.error',
      feedbackError: '#js_main_error_feedback',
      fingerprintInput: '#js_setup_key_fingerprint',
      domainCheckboxWrapper: '.input.checkbox',
      domainCheckbox: '#js_setup_domain_check',
      keyInfoLink: '#js_server_key_info'
    },

    // Will be used at runtime.
    _data: {
      domain: '',
      serverKey: null,
      serverKeyInfo: {}
    }
  };

  /**
   * Implements init().
   * @return {promise}
   */
  step.init = function () {
    step.viewData.browserName = passbolt.html.getBrowserName();

    // retrieve the setup settings.
    return passbolt.setup.get('settings')
      .then(function (settings) {
        step.viewData.domain = step._data.domain = settings.domain;
      });
  };

  /**
   * Implements start().
   */
  step.start = function () {
    step.elts.$domainCheckboxWrapper.css('visibility', 'hidden');

    // username and name is set, get the server key.
    step.fetchServerKey();

    // Check if server is already configured, and display warning.
    passbolt.request('passbolt.addon.isConfigured')
      .then(function (isConfigured) {
        if (isConfigured) {
          step._getUserDomain()
            .then(step._getUserData)
            .then(function (userSettings) {
              return passbolt.html.loadTemplate($('.plugin-check .message'), 'setup/already_configured.ejs', 'html', userSettings);
            })
            .then(function () {
              $('.plugin-check .message')
                .parent()
                .removeClass('success')
                .addClass('warning');
            });
        }
      });

    // Bind domain check change event.
    step.elts.$domainCheckbox.change(step.onDomainCheck);

    // Init key info dialog.
    step.elts.$keyInfoLink.click(step.onServerKeyInfo);
  };

  /**
   * Implements submit().
   * @returns {Promise}
   */
  step.submit = function () {
    return new Promise(function(resolve, reject) {
      // Set submit form as processing.
      passbolt.setup.setActionState('submit', 'processing');

      // Set domain in the settings.
      step.setDomain(step._data.domain)
        .then(function () {
          // If domain was set succesfully, attempt to import the server key.
          return step.setServerKey(step._data.serverKeyInfo.key);
        })
        .then(function () {
          // If server key was imported successfully, resolve submit.
          setTimeout(function () {
            resolve();
          }, 1000)
        })
        // In case of error,  display fatal error.
        .then(null, function (msg) {
          passbolt.setup.fatalError(msg);
          reject();
        });
    });
  };

  /**
   * Implements cancel().
   */
  step.cancel = function () {
    // No cancel action available at this step.
    return null;
  };

  /* ==================================================================================
   *  Chainable functions
   * ================================================================================== */

  /**
   * Fetch server key.
   * @param domain domain where to fetch the server key.
   * @returns {Promise}
   * @private
   */
  step._fetchServerKey = function (domain) {
    return passbolt.request('passbolt.auth.getServerKey', domain)
      .then(function (serverKey) {
        step._data.serverKey = serverKey.keydata;
        return serverKey.keydata;
      });
  };

  /**
   * Get public key information.
   * @param unarmoredServerKey {string} Unarmored server key
   * @returns {Promise}
   * @private
   */
  step._getKeyInfo = function (unarmoredServerKey) {
    // Now, request information for the given key, and store them in a variable.
    return passbolt.request('passbolt.keyring.public.info', unarmoredServerKey)
      .then(function (keyInfo) {
        step._data.serverKeyInfo = keyInfo;
        return step._data.serverKeyInfo;
      });
  };

  /**
   * Display key info.
   * @param keyInfo {array} The key information
   * @private
   */
  step._displayKeyInfo = function (keyInfo) {
    step.elts.$fingerprintInput.attr('value', keyInfo.fingerprint.toUpperCase());
    step.elts.$domainCheckboxWrapper.css('visibility', 'visible');
  };

  /**
   * Get user domain.
   * @returns {Promise}
   * @private
   */
  step._getUserDomain = function () {
    return passbolt.request('passbolt.user.settings.get.domain')
      .then(function (domain) {
        return domain;
      });
  };

  /**
   * Get user data.
   * @returns {Promise}
   * @private
   */
  step._getUserData = function (domain) {
    return passbolt.request('passbolt.user.get', {user: ['firstname', 'lastname', 'username']})
      .then(function (user) {
        user.domain = domain;
        return user;
      });
  };

  /* ==================================================================================
   *  Content code events
   * ================================================================================== */

  /**
   * Display an error message for server key.
   */
  step.onErrorServerKey = function () {
    step.elts.$fingerprintWrapper.addClass('error');
    step.elts.$fingerprintError.text("Could not retrieve server key. Please contact administrator.");
  };

  /**
   * On Domain check.
   * Happens when the domain checkbox is checked by the user.
   */
  step.onDomainCheck = function () {
    if (!step.elts.$domainCheckbox.is(':checked')) {
      passbolt.setup.setActionState('submit', 'disabled');
    } else {
      passbolt.setup.setActionState('submit', 'enabled');
    }
  };

  /**
   * On server key info click.
   * Happens when the user has clicked on More link next to the server key fingerprint.
   * @returns {boolean}
   */
  step.onServerKeyInfo = function () {
    if (step.elts.$fingerprintInput.val() != '') {

      step.showKeyInfoDialog(step._data.serverKeyInfo);
    }
    return false;
  };

  /**
   * On error.
   * Is called for general errors that doesn't require specific behavior.
   * @param errorMsg {string} The error message
   */
  step.onError = function (errorMsg) {
    step.elts.$feedbackError
      .removeClass('hidden')
      .text(errorMsg);
  };

  /* ==================================================================================
   *  Business functions
   * ================================================================================== */

  /**
   * Set domain in the settings.
   * Is called at the page submit.
   *
   * @param domain {string} The domain
   * @returns {Promise}
   */
  step.setDomain = function (domain) {
    return passbolt.request('passbolt.setup.set', 'settings.domain', domain)
      .then(null, function (errorMsg) {
        step.onError(errorMsg);
      });
  };

  /**
   * Set the server key in the settings.
   * Is called at the page submit.
   *
   * @param armoredServerKey {sting} The armored key to set
   * @returns {Promise}
   */
  step.setServerKey = function (armoredServerKey) {
    return passbolt.request('passbolt.setup.set', 'settings.armoredServerKey', armoredServerKey)
      .then(null, function (errorMsg) {
        step.onError(errorMsg);
      });
  };

  /**
   * Show key information dialog, and initialize its components.
   *
   * @param keyInfo {array} key information, as returned by getKeyInfo().
   * @returns {Promise}
   */
  step.showKeyInfoDialog = function (keyInfo) {
    return passbolt.html.loadTemplate($('body'), 'setup/dialog_key_info.ejs', 'prepend', keyInfo)
      .then(function () {
        var $dialog = $('.dialog-wrapper');
        // Init controls close and ok.
        $('.js-dialog-close, input[type=submit]', $dialog).click(function () {
          $dialog.remove();
        });
        // TODO : Help page and re-enable help button in dialog view.
      });
  };

  /**
   * Fetch and display server key.
   */
  step.fetchServerKey = function () {
    step._fetchServerKey(step._data.domain)
      .then(step._getKeyInfo)
      .then(step._displayKeyInfo)
      .then(null, function (msg) {
        console.error(msg);
        step.onErrorServerKey();
      });
  };

  passbolt.setup.steps[step.id] = step;

});
