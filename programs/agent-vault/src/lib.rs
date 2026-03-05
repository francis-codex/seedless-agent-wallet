use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("697JZH3975kVFxUCdtMqPejbagTN4VihtGde5b9k8VdN");

const SECONDS_PER_DAY: i64 = 86_400;

#[program]
pub mod agent_vault {
    use super::*;

    /// Create a new vault PDA for an agent with initial policy config.
    pub fn create_vault(
        ctx: Context<CreateVault>,
        max_per_tx: u64,
        max_daily: u64,
        cooldown_seconds: u32,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.agent = ctx.accounts.agent.key();
        vault.policy = PolicyConfig {
            max_per_tx,
            max_daily,
            daily_spent: 0,
            last_reset: Clock::get()?.unix_timestamp,
            cooldown_seconds,
            last_tx_time: 0,
            is_active: true,
        };
        vault.total_spent = 0;
        vault.tx_count = 0;
        vault.bump = ctx.bumps.vault;

        msg!(
            "Vault created: authority={}, agent={}, max_per_tx={}, max_daily={}, cooldown={}s",
            vault.authority,
            vault.agent,
            max_per_tx,
            max_daily,
            cooldown_seconds
        );
        Ok(())
    }

    /// Deposit SOL into the vault. Anyone can deposit.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        msg!(
            "Deposited {} lamports into vault {}",
            amount,
            ctx.accounts.vault.key()
        );
        Ok(())
    }

    /// Agent withdraws SOL from vault, subject to policy enforcement.
    pub fn agent_withdraw(
        ctx: Context<AgentWithdraw>,
        amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let now = Clock::get()?.unix_timestamp;

        // Check: vault is active (kill switch)
        require!(vault.policy.is_active, VaultError::VaultInactive);

        // Check: per-transaction limit
        require!(
            amount <= vault.policy.max_per_tx,
            VaultError::ExceedsPerTxLimit
        );

        // Check: cooldown period
        if vault.policy.cooldown_seconds > 0 && vault.policy.last_tx_time > 0 {
            let elapsed = now - vault.policy.last_tx_time;
            require!(
                elapsed >= vault.policy.cooldown_seconds as i64,
                VaultError::CooldownActive
            );
        }

        // Reset daily counter if 24h have passed
        if now - vault.policy.last_reset >= SECONDS_PER_DAY {
            vault.policy.daily_spent = 0;
            vault.policy.last_reset = now;
        }

        // Check: daily limit
        require!(
            vault.policy.daily_spent.checked_add(amount).ok_or(VaultError::Overflow)?
                <= vault.policy.max_daily,
            VaultError::ExceedsDailyLimit
        );

        // Check: vault has enough balance (subtract rent-exempt minimum)
        let vault_lamports = vault.to_account_info().lamports();
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(AgentVault::INIT_SPACE + 8);
        require!(
            vault_lamports.saturating_sub(min_balance) >= amount,
            VaultError::InsufficientFunds
        );

        // Transfer SOL from vault PDA to destination
        vault.sub_lamports(amount)?;
        ctx.accounts.destination.add_lamports(amount)?;

        // Update accounting
        vault.policy.daily_spent = vault.policy.daily_spent.checked_add(amount).ok_or(VaultError::Overflow)?;
        vault.policy.last_tx_time = now;
        vault.total_spent = vault.total_spent.checked_add(amount).ok_or(VaultError::Overflow)?;
        vault.tx_count = vault.tx_count.checked_add(1).ok_or(VaultError::Overflow)?;

        msg!(
            "Agent withdrew {} lamports to {}. Daily: {}/{}, Total: {}, Tx#: {}",
            amount,
            ctx.accounts.destination.key(),
            vault.policy.daily_spent,
            vault.policy.max_daily,
            vault.total_spent,
            vault.tx_count
        );
        Ok(())
    }

    /// Authority updates the policy configuration.
    pub fn update_policy(
        ctx: Context<AuthorityAction>,
        max_per_tx: u64,
        max_daily: u64,
        cooldown_seconds: u32,
        is_active: bool,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.policy.max_per_tx = max_per_tx;
        vault.policy.max_daily = max_daily;
        vault.policy.cooldown_seconds = cooldown_seconds;
        vault.policy.is_active = is_active;

        msg!(
            "Policy updated: max_per_tx={}, max_daily={}, cooldown={}s, active={}",
            max_per_tx,
            max_daily,
            cooldown_seconds,
            is_active
        );
        Ok(())
    }

    /// Emergency stop - authority disables the vault immediately.
    pub fn emergency_stop(ctx: Context<AuthorityAction>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.policy.is_active = false;

        msg!("EMERGENCY STOP: Vault {} deactivated", vault.key());
        Ok(())
    }

    /// Authority drains all SOL from vault back to a destination.
    pub fn drain_vault(ctx: Context<DrainVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(AgentVault::INIT_SPACE + 8);
        let vault_lamports = vault.to_account_info().lamports();
        let drainable = vault_lamports.saturating_sub(min_balance);

        require!(drainable > 0, VaultError::InsufficientFunds);

        vault.sub_lamports(drainable)?;
        ctx.accounts.destination.add_lamports(drainable)?;

        // Deactivate after drain
        vault.policy.is_active = false;

        msg!(
            "Vault drained: {} lamports sent to {}",
            drainable,
            ctx.accounts.destination.key()
        );
        Ok(())
    }
}

// ── Accounts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Agent pubkey, does not need to sign vault creation.
    pub agent: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + AgentVault::INIT_SPACE,
        seeds = [b"vault", authority.key().as_ref(), agent.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, AgentVault>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, AgentVault>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AgentWithdraw<'info> {
    #[account(
        mut,
        has_one = agent,
    )]
    pub vault: Account<'info, AgentVault>,

    pub agent: Signer<'info>,

    /// CHECK: Destination for SOL transfer, validated by caller.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct AuthorityAction<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub vault: Account<'info, AgentVault>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DrainVault<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub vault: Account<'info, AgentVault>,

    pub authority: Signer<'info>,

    /// CHECK: Destination for drained SOL.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
}

// ── State ─────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct AgentVault {
    pub authority: Pubkey,      // 32
    pub agent: Pubkey,          // 32
    pub policy: PolicyConfig,   // see below
    pub total_spent: u64,       // 8
    pub tx_count: u64,          // 8
    pub bump: u8,               // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct PolicyConfig {
    pub max_per_tx: u64,        // 8
    pub max_daily: u64,         // 8
    pub daily_spent: u64,       // 8
    pub last_reset: i64,        // 8
    pub cooldown_seconds: u32,  // 4
    pub last_tx_time: i64,      // 8
    pub is_active: bool,        // 1
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum VaultError {
    #[msg("Vault is inactive (emergency stop engaged)")]
    VaultInactive,
    #[msg("Amount exceeds per-transaction limit")]
    ExceedsPerTxLimit,
    #[msg("Amount exceeds daily spending limit")]
    ExceedsDailyLimit,
    #[msg("Cooldown period has not elapsed")]
    CooldownActive,
    #[msg("Insufficient vault funds")]
    InsufficientFunds,
    #[msg("Arithmetic overflow")]
    Overflow,
}
