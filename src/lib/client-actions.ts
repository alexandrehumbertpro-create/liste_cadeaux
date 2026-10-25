import * as server from "@/app/actions";
function safe<Args extends unknown[], R extends { ok: boolean }>(
  action: (...args: Args) => Promise<R>,
) {
  return async (...args: Args): Promise<R | { ok: false; error: string }> => {
    try {
      return await action(...args);
    } catch {
      return {
        ok: false,
        error: "La connexion a été interrompue. Réessayez.",
      };
    }
  };
}
export const login = safe(server.login),
  saveGift = safe(server.saveGift),
  createRecipient = safe(server.createRecipient),
  updateRecipientColor = safe(server.updateRecipientColor),
  saveList = safe(server.saveList),
  archiveGift = safe(server.archiveGift),
  resetGift = safe(server.resetGift),
  revealGift = safe(server.revealGift),
  archiveList = safe(server.archiveList),
  updatePreferences = safe(server.updatePreferences),
  uploadImage = safe(server.uploadImage),
  recordShare = safe(server.recordShare),
  reserveGift = safe(server.reserveGift),
  askGiftQuestion = safe(server.askGiftQuestion),
  reserveForGuest = safe(server.reserveForGuest),
  cancelReservation = safe(server.cancelReservation),
  changeProposalLists = safe(server.changeProposalLists),
  duplicateProposals = safe(server.duplicateProposals),
  undoArchive = safe(server.undoArchive),
  addCandidate = safe(server.addCandidate);
export const logout = server.logout;
export type Result<T = unknown> = server.Result<T>;

export const renameRecipient = safe(server.renameRecipient),
  removeRecipient = safe(server.removeRecipient),
  shareIdeaEmail = safe(server.shareIdeaEmail),
  disconnectGmail = safe(server.disconnectGmail),
  retryMyEmails = safe(server.retryMyEmails);
