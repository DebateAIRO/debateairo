from app.argument_claim.model import ArgumentClaim

__all__ = ["ArgumentClaim", "argument_claim_from_node"]


def __getattr__(name: str):
    if name == "argument_claim_from_node":
        from app.argument_claim.node_adapter import argument_claim_from_node

        return argument_claim_from_node
    raise AttributeError(name)
