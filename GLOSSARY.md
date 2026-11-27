# Snowball

Snowball helps a signed-in person see their credit card debt and plan how to pay it off.

## Language

**Account data**:
Everything Snowball saves for one signed-in person: their connections and their payoff plan.
_Avoid_: Session, workspace, store

**Connection**:
One bank a person has linked to Snowball, together with the cards it returns. On Plaid's side it is a Plaid Item.
_Avoid_: Item (except when discussing Plaid), linked bank

**Institution**:
The bank or card issuer behind a connection.
_Avoid_: Using it for the connection itself

**Estimate**:
A calculated monthly payment and payoff outcome shown for review, not yet saved.
_Avoid_: Preview plan, quote

**Payoff plan**:
The estimate a person chose to save. It is out of date when its cards or start month no longer match the current ones.
_Avoid_: Saved estimate, stale plan, budget

**Session**:
A person's signed-in state with Snowball, from sign-in until sign-out or expiry.
_Avoid_: Using it for saved account data
