// Confirm your email, once, right after creating an account: the buyer types the 6-digit
// code into the code boxes and the account is ready. The code is a placeholder for now.
(function () {
  class VerifyPage {
    /**
     * @param {string} email
     * @param {{send: () => Promise<void>, verify: (code: string) => Promise<void>}} actions
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
        <p class="dev-code">${window.Cinnarios.DemoCode.note()}</p>
        <p class="auth-foot"><a href="#account">Do this later</a></p>
      </div></section>`;
    }

    async bind() {
      new window.Cinnarios.CodeInput(document.querySelector('#verify-code'), {
        check: (code) => this.actions.verify(code),
        resend: () => this.actions.send(),
        done: () => {
          document.querySelector('#verify-step').outerHTML = `<div class="step-in">
            <div class="done-badge">${window.Cinnarios.icons.check()}</div>
            <h1>Email confirmed</h1>
            <p class="auth-lede">Your account is ready. Your tries, saved paintings and cart will be kept here.</p>
            <a class="button auth-wide" href="#account">Go to your account</a></div>`;
        },
      }).mount();
      await this.actions.send();
    }
  }

  window.Cinnarios = window.Cinnarios || {};
  window.Cinnarios.VerifyPage = VerifyPage;
}());
