import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, UserPlus } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { useCall, type CallUser } from "@/context/CallContext";
import { listContacts, type Contact } from "@/services/contacts";

interface AddParticipantModalProps {
  onClose: () => void;
}

/**
 * Lets you pull someone from your contacts into the call you're already
 * on — turns a 1:1 call into a group call, or adds to one already going.
 * Pulls from GET /contacts (your own, curated list — see ContactsPage /
 * AddContactModal for where those get added) rather than the full user
 * directory; you can only invite people you've actually added.
 */
export function AddParticipantModal({ onClose }: AddParticipantModalProps) {
  const { participants, inviteToCall } = useCall();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [invited, setInvited] = useState<Set<number>>(new Set());

  useEffect(() => {
    listContacts()
      .then(setContacts)
      .catch((err) => console.error("Failed to fetch contacts:", err))
      .finally(() => setLoading(false));
  }, []);

  const onCallIds = new Set(participants.map((p) => p.user.id));

  const available = contacts.filter(
    (c) =>
      !onCallIds.has(c.id) &&
      c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = (contact: Contact) => {
    inviteToCall({ id: contact.id, name: contact.name });
    setInvited((prev) => new Set(prev).add(contact.id));
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-[#0F172A] border border-[#334155]/60 rounded-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#334155]/60">
            <p className="text-[#F8FAFC] font-semibold">Add to call</p>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#334155]/40 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-3 border-b border-[#334155]/60">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts..."
                className="w-full bg-[#1E293B] border border-[#334155]/60 rounded-xl pl-9 pr-3 py-2 text-[#F8FAFC] text-sm placeholder-[#475569] outline-none focus:border-[#06B6D4]/60"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <p className="px-5 py-6 text-center text-[#94A3B8] text-sm">Loading...</p>
            ) : available.length === 0 ? (
              <p className="px-5 py-6 text-center text-[#94A3B8] text-sm">
                No one else to add.
              </p>
            ) : (
              available.map((contact) => {
                const isInvited = invited.has(contact.id);
                return (
                  <button
                    key={contact.id}
                    onClick={() => !isInvited && handleInvite(contact)}
                    disabled={isInvited}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[#334155]/30 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#1E293B] border border-[#334155] flex items-center justify-center shrink-0">
                      <span className="text-[#94A3B8] text-xs font-bold">
                        {getInitials(contact.name)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#F8FAFC] text-sm font-medium truncate">
                        {contact.name}
                      </p>
                    </div>
                    {isInvited ? (
                      <span className="text-[#06B6D4] text-xs shrink-0">Invited</span>
                    ) : (
                      <UserPlus className="w-4 h-4 text-[#94A3B8] shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
