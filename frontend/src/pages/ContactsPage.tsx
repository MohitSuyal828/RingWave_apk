import { useCall } from "@/context/CallContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  UserPlus,
  Phone,
  MoreVertical,
  UserCheck,
  Users,
  X,
  History,
  UserMinus,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { listContacts, removeContact, type Contact } from "@/services/contacts";
import { AddContactModal } from "@/components/AddContactModal";

const ContactsPage = () => {
  const { startCall } = useCall();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Multi-select for starting a group call.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Which contact's "more" dropdown is currently open (null = none).
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [showAddContactModal, setShowAddContactModal] = useState(false);

  const handleAddContactClick = () => {
    setShowAddContactModal(true);
  };

  const handleContactAdded = (added: { id: number; name: string; email: string }) => {
    // Optimistic — avoids a full refetch for a single addition. Shape
    // matches what GET /contacts returns closely enough for immediate
    // display; the next real fetch (e.g. after navigating away and back)
    // will pick up the authoritative added_at/user_created_at fields.
    setContacts((prev) =>
      prev.some((c) => c.id === added.id)
        ? prev
        : [
            ...prev,
            {
              id: added.id,
              name: added.name,
              email: added.email,
              user_created_at: "",
              added_at: new Date().toISOString(),
            },
          ].sort((a, b) => a.name.localeCompare(b.name))
    );
  };

  const handleRemoveContact = async (contact: Contact) => {
    setOpenMenuId(null);
    const previous = contacts;
    // Optimistic removal — this is a low-stakes, easily-reversible action
    // (re-adding takes one tap), so waiting on the network round trip
    // before updating the UI would just make the app feel slower for no
    // real safety benefit.
    setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    try {
      await removeContact(contact.id);
    } catch (err) {
      console.error("Failed to remove contact:", err);
      setContacts(previous); // roll back — the removal didn't actually happen
    }
  };

  useEffect(() => {
    if (openMenuId === null) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  const handleViewHistory = (contact: Contact) => {
    setOpenMenuId(null);
    navigate(
      `${ROUTES.CALL_HISTORY}?contactId=${contact.id}&contactName=${encodeURIComponent(contact.name)}`
    );
  };

  useEffect(() => {
    const fetchContacts = async () => {
      setError(null);
      try {
        const data = await listContacts();
        setContacts(data);
      } catch (err) {
        console.error("Failed to fetch contacts:", err);
        setError("Couldn't load contacts. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [retryKey]);

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selectedIds.has(c.id)),
    [contacts, selectedIds]
  );

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleCallOne = (contact: Contact) => {
    startCall([{ id: contact.id, name: contact.name }]);
  };

  const handleStartGroupCall = () => {
    if (selectedContacts.length === 0) return;

    startCall(
      selectedContacts.map((c) => ({ id: c.id, name: c.name }))
    );

    exitSelectMode();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#94A3B8]">
        Loading contacts...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[#94A3B8]">
        <p>{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setRetryKey((k) => k + 1);
          }}
          className="bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-[#020617] font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#F8FAFC]">Contacts</h2>
          <p className="text-[#94A3B8] text-sm mt-1">
            Manage your connections
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(
            <button
              onClick={() =>
                selectMode ? exitSelectMode() : setSelectMode(true)
              }
              className={`flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors ${
                selectMode
                  ? "bg-[#334155]/60 text-[#F8FAFC]"
                  : "bg-[#1E293B] border border-[#334155]/60 text-[#F8FAFC] hover:border-[#06B6D4]/60"
              }`}
            >
              {selectMode ? (
                <>
                  <X className="w-4 h-4" />
                  Cancel
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  Group Call
                </>
              )}
            </button>
          )}

          <button
            onClick={handleAddContactClick}
            className="flex items-center gap-2 bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-[#020617] font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />

        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#1E293B]/60 border border-[#334155]/60 rounded-xl pl-11 pr-4 py-3 text-[#F8FAFC] text-sm placeholder-[#334155] outline-none focus:border-[#06B6D4]/60 transition-colors"
        />
      </div>

      {/* Contacts */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-16 text-[#94A3B8] space-y-3">
            <p>{contacts.length === 0 ? "No contacts yet" : "No contacts found"}</p>
            {contacts.length === 0 && (
              <button
                onClick={handleAddContactClick}
                className="inline-flex items-center gap-2 bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-[#020617] font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add your first contact
              </button>
            )}
          </div>
        ) : (
          filtered.map((contact, i) => {
            const isSelected = selectedIds.has(contact.id);

            return (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => selectMode && toggleSelected(contact.id)}
                className={`bg-[#1E293B]/60 backdrop-blur border rounded-2xl p-4 flex items-center gap-3 transition-colors group ${
                  selectMode ? "cursor-pointer" : ""
                } ${
                  isSelected
                    ? "border-[#06B6D4]"
                    : "border-[#334155]/60 hover:border-[#334155]"
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center">
                    <span className="text-[#94A3B8] text-sm font-bold">
                      {contact.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                  </div>

                  {/* Offline by default until Socket.IO presence is added */}
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#1E293B] bg-[#334155]" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[#F8FAFC] text-sm font-medium truncate">
                    {contact.name}
                  </p>

                  <p className="text-[#94A3B8] text-xs truncate">
                    {contact.email}
                  </p>
                </div>

                {/* Actions */}
                {selectMode ? (
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "bg-[#06B6D4] border-[#06B6D4]"
                        : "border-[#334155]"
                    }`}
                  >
                    {isSelected && (
                      <UserCheck className="w-3.5 h-3.5 text-[#020617]" />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCallOne(contact);
                      }}
                      className="w-8 h-8 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/20 flex items-center justify-center text-[#22C55E] hover:bg-[#22C55E]/20 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>

                    <div className="relative" ref={openMenuId === contact.id ? menuRef : undefined}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId((id) => (id === contact.id ? null : contact.id));
                        }}
                        className="w-8 h-8 rounded-lg bg-[#334155]/40 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      <AnimatePresence>
                        {openMenuId === contact.id && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.96 }}
                            transition={{ duration: 0.12 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-9 z-20 w-52 bg-[#1E293B] border border-[#334155]/60 rounded-xl shadow-xl shadow-black/40 overflow-hidden"
                          >
                            <button
                              onClick={() => handleViewHistory(contact)}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[#F8FAFC] hover:bg-[#334155]/40 transition-colors"
                            >
                              <History className="w-4 h-4 text-[#06B6D4]" />
                              View call history
                            </button>
                            <button
                              onClick={() => handleRemoveContact(contact)}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[#EF4444] hover:bg-[#334155]/40 transition-colors"
                            >
                              <UserMinus className="w-4 h-4" />
                              Remove contact
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* Floating group-call bar */}
      <AnimatePresence>
        {selectMode && selectedContacts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1E293B] border border-[#334155] rounded-2xl px-5 py-3 flex items-center gap-4 shadow-xl shadow-black/40"
          >
            <span className="text-[#F8FAFC] text-sm font-medium">
              {selectedContacts.length} selected
            </span>
            <button
              onClick={handleStartGroupCall}
              className="flex items-center gap-2 bg-[#22C55E] hover:bg-[#22C55E]/90 text-[#020617] font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              <Phone className="w-4 h-4" />
              Start Group Call
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {showAddContactModal && (
        <AddContactModal
          existingContactIds={new Set(contacts.map((c) => c.id))}
          onClose={() => setShowAddContactModal(false)}
          onContactAdded={handleContactAdded}
        />
      )}
    </div>
  );
};

export default ContactsPage;
