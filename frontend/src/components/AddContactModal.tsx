import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, UserPlus, Check } from "lucide-react";
import { axiosInstance } from "@/services/axios";
import { addContact } from "@/services/contacts";
import { getInitials } from "@/lib/utils";

interface DirectoryUser {
  id: number;
  name: string;
  email: string;
}

interface AddContactModalProps {
  /** ids already in the caller's contact list, so they don't show as
   *  addable here (avoids a confusing "Add" on someone already added). */
  existingContactIds: Set<number>;
  onClose: () => void;
  /** Called once per successful add, so the parent page can update its
   *  own contacts list without needing a full refetch. */
  onContactAdded: (contact: DirectoryUser) => void;
}

/**
 * The actual "add a contact" flow: searches the full user directory
 * (GET /users — every registered RingWave user, same endpoint the old
 * Contacts page used to show as the contact list itself) and lets you
 * explicitly add one to YOUR OWN contacts (POST /contacts). This is the
 * only place in the app that still shows the full directory — the
 * Contacts page itself now only ever shows contacts you've actually
 * added.
 */
export function AddContactModal({
  existingContactIds,
  onClose,
  onContactAdded,
}: AddContactModalProps) {
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [addingId, setAddingId] = useState<number | null>(null);

  useEffect(() => {
    axiosInstance
      .get("/users")
      .then((res) => setDirectory(res.data.data.users))
      .catch((err) => {
        console.error("Failed to fetch user directory:", err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = directory.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (user: DirectoryUser) => {
    setAddingId(user.id);
    try {
      await addContact(user.id);
      setAddedIds((prev) => new Set(prev).add(user.id));
      onContactAdded(user);
    } catch (err) {
      console.error("Failed to add contact:", err);
    } finally {
      setAddingId(null);
    }
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
            <p className="text-[#F8FAFC] font-semibold">Add contact</p>
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
                placeholder="Search by name or email..."
                className="w-full bg-[#1E293B] border border-[#334155]/60 rounded-xl pl-9 pr-3 py-2 text-[#F8FAFC] text-sm placeholder-[#475569] outline-none focus:border-[#06B6D4]/60"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <p className="px-5 py-6 text-center text-[#94A3B8] text-sm">Loading...</p>
            ) : error ? (
              <p className="px-5 py-6 text-center text-[#94A3B8] text-sm">
                Couldn't load users. Try again.
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-6 text-center text-[#94A3B8] text-sm">
                {directory.length === 0
                  ? "No other users are registered yet."
                  : "No matches."}
              </p>
            ) : (
              filtered.map((user) => {
                const alreadyContact = existingContactIds.has(user.id) || addedIds.has(user.id);
                const isAdding = addingId === user.id;

                return (
                  <button
                    key={user.id}
                    onClick={() => !alreadyContact && !isAdding && handleAdd(user)}
                    disabled={alreadyContact || isAdding}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[#334155]/30 transition-colors text-left disabled:hover:bg-transparent"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#1E293B] border border-[#334155] flex items-center justify-center shrink-0">
                      <span className="text-[#94A3B8] text-xs font-bold">
                        {getInitials(user.name)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#F8FAFC] text-sm font-medium truncate">
                        {user.name}
                      </p>
                      <p className="text-[#94A3B8] text-xs truncate">{user.email}</p>
                    </div>
                    {alreadyContact ? (
                      <span className="flex items-center gap-1 text-[#22C55E] text-xs shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        Added
                      </span>
                    ) : isAdding ? (
                      <span className="text-[#94A3B8] text-xs shrink-0">Adding...</span>
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
