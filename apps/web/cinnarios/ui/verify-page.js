// Confirm your email, once, right after creating an account: a 6-digit code is sent, the
// buyer types it into the code boxes, and the account is ready.
(function () {
  class VerifyPage {
    /**
     * @param {string} email
     * @param {{send: () => Promise<{devCode?: string}>, verify: (code: string) => Promise<void>}} actions
     * @param {{esc: Function}} format
     */
    constructor(email, actions, format) {
      this.email = email;
      this.actions = actions;
      this.esc = format.esc;
    }

    html() {
      return `
      <section class="auth-card"><div id="verify-step" class="step-in">
        <div class="auth-badge">${window.Cinnarios.icons.mail()}</div>
        <h1>Confirm your email</h1>
        <p class="auth-lede">We sent a 6-digit code to <strong>${this.esc(this.email)}</strong>. You only do this once.</p>
        <div id="verify-code"></div>
        <p class="dev-code" hidden></p>
        <p class="auth-foot"><a href="#account">Do this later</a></p>
      </div></section>`;
    }

    showDev(sent) {
      const dev = document.querySelector('.dev-code');
      if (!dev || !sent || !sent.devCode) return;
      dev.hidden = false;
      dev.textContent = `Development: the code is ${sent.devCode}`;
    }

    async bind() {
      new window.Cinnarios.CodeInput(document.querySelector('#verify-code'), {
        check: (code) => this.actions.verify(code),
        resend: async () => this.showDev(await this.actions.send()),
        done: () => {
          document.querySelector('#verify-step').outerHTML = `<div class="step-in">
            <div class="done-badge">${window.Cinnarios.icons.check()}</div>
            <h1>Email confirmed</h1>
            <p class="auth-lede">Your account is ready. Your tries, saved paintings and cart will be kept here.</p>
            <a class="button auth-wide" href="#account">Go to your account</a></div>`;
        },
      }).mount();
      try {
        this.showDev(await this.actions.send());
      } catch (err) {
        document.querySelector('#verify-code .code-message').textContent = err.message;
      }
    }
  }

  window.Cinnarios = window.Cinnarios || {};
  window.Cinnarios.VerifyPage = VerifyPage;
}());
